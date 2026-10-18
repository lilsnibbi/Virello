import { createHash } from "node:crypto";
import { randomUUIDv7 } from "bun";
import { container } from "../../core/Container";
import { writeEvent } from "../../core/logging/diagnostics";
import { MemoryBackend } from "./backends/MemoryBackend";
import { RedisBackend } from "./backends/RedisBackend";
import type { TaskBackend } from "./backends/TaskBackend";
import {
	clonePayload,
	nextOccurrence,
	nonnegative,
	validateJobOptions,
	validateRepeat,
	validateSchedulerOptions,
} from "./timing";
import { TaskEvents } from "./types/TaskEvents";
import type {
	RepeatedTask,
	RepeatedTaskInfo,
	RepeatedTaskListOptions,
	TaskCleanupOptions,
	TaskJob,
	TaskListOptions,
	TaskNameWithoutPayload,
	TaskOptions,
	TaskRecord,
	TaskResolvable,
	TaskRunContext,
	TaskSchedulerOptions,
} from "./types/TaskTypes";

/** Persistent Redis scheduling or a volatile process-local queue. */
export class TaskScheduler {
	/** Frozen copy of the supplied scheduler settings; omitted defaults are not filled into this object. */
	public readonly options: Readonly<TaskSchedulerOptions>;
	/** Queue namespace. Defaults to scheduled-tasks. */
	public readonly queue: string;
	/** Selected backend: process-local memory, or Redis when redis_url was supplied. */
	public readonly storage: "memory" | "redis";
	private readonly backend: TaskBackend;
	private timer?: ReturnType<typeof setInterval>;
	private starting?: Promise<this>;
	private pumping?: Promise<void>;
	private closing?: Promise<void>;
	private closed = false;
	private readonly running = new Set<Promise<void>>();
	private readonly operations = new Set<Promise<unknown>>();
	private connectionFailed = false;

	/**
	 * Validate settings and select a backend without connecting.
	 * @param options - Queue and lease settings. Omit for in-memory scheduling.
	 * @throws If settings are invalid or unsupported.
	 */
	constructor(options: TaskSchedulerOptions = {}) {
		validateSchedulerOptions(options);
		this.options = Object.freeze({ ...options });
		this.queue = options.queue ?? "scheduled-tasks";
		this.storage = options.redis_url === undefined ? "memory" : "redis";
		this.backend =
			options.redis_url === undefined
				? new MemoryBackend()
				: new RedisBackend({ ...options, redis_url: options.redis_url });
	}

	/**
	 * Connect to storage, verify claims, and begin polling once.
	 * @returns This scheduler after startup. Repeated calls share the startup promise.
	 * @throws If closed or the initial storage/claim operation fails. Startup failure closes the scheduler.
	 */
	public start(): Promise<this> {
		if (this.closed)
			return Promise.reject(new Error("This task scheduler is closed."));
		this.starting ??= (async () => {
			try {
				await this.backend.connect();
				if (this.closed) return this;
				// Verify claims are permitted before declaring startup successful.
				await this.claimWork();
				if (this.closed) return this;
				this.timer = setInterval(() => {
					void this.pump();
				}, this.options.pollInterval ?? 250);
				return this;
			} catch (cause) {
				this.closed = true;
				clearInterval(this.timer);
				try {
					await Promise.allSettled([...this.operations, ...this.running]);
					await this.backend.close();
				} catch (cleanup) {
					throw new AggregateError(
						[cause, cleanup],
						"Scheduler startup and cleanup failed.",
						{ cause: cleanup },
					);
				}
				throw cause;
			}
		})();
		return this.starting;
	}

	/**
	 * Store a job; call start() or log in the owning client to execute it.
	 * @param task - Task name or name/payload reference. Stored payloads must be plain acyclic JSON or undefined.
	 * @param options - One-off delay in milliseconds, or job/schedule options. Defaults to an immediate one-off job.
	 * @returns The stored job. Duplicate IDs retain the existing record.
	 * @throws For closure, invalid names/payloads/options, or storage failure.
	 */
	public create<T extends TaskResolvable>(
		task: T,
		options: TaskOptions | number = {},
	): Promise<TaskJob<T>> {
		return this.operation(async () => {
			const { name, payload } = this.resolveTask(task);
			const config: TaskOptions =
				typeof options === "number" ? { delay: options } : options;
			if (!config || typeof config !== "object" || Array.isArray(config))
				throw new TypeError("Task options must be an object or delay.");
			for (const key of Object.keys(config))
				if (
					![
						"repeated",
						"delay",
						"interval",
						"pattern",
						"timezone",
						"jobId",
						"attempts",
						"retryDelay",
						"removeOnComplete",
						"removeOnFail",
					].includes(key)
				)
					throw new TypeError(
						`Unsupported task option "${key}". BullMQ job options are no longer supported.`,
					);
			nonnegative("delay", config.delay ?? 0);
			validateJobOptions(config);
			if (config.repeated !== undefined && typeof config.repeated !== "boolean")
				throw new TypeError("repeated must be boolean.");
			const now = Date.now();
			let repeat: TaskRecord["repeat"];
			if (config.repeated) {
				if (config.delay !== undefined)
					throw new TypeError("Repeated tasks cannot specify a delay.");
				repeat = {
					interval: config.interval,
					pattern: config.pattern,
					timezone: config.timezone,
				};
				validateRepeat(repeat);
				if (repeat.pattern) repeat.timezone ??= "UTC";
			} else if (
				"interval" in config ||
				"pattern" in config ||
				"timezone" in config
			)
				throw new TypeError("Interval and cron tasks require repeated: true.");
			const runAt = repeat
				? nextOccurrence(repeat, now, now)
				: now + (config.delay ?? 0);
			nonnegative("scheduled timestamp", runAt);
			const id =
				config.jobId ??
				(repeat
					? "repeat:" +
						createHash("sha256")
							.update(JSON.stringify([name, repeat]))
							.digest("hex")
					: randomUUIDv7());
			const record: TaskRecord = {
				id,
				name,
				data: clonePayload(payload),
				createdAt: now,
				updatedAt: now,
				runAt,
				scheduledAt: runAt,
				state: "waiting",
				attemptsMade: 0,
				failures: 0,
				repeat,
				options: {
					attempts: config.attempts ?? 1,
					retryDelay: config.retryDelay ?? 0,
					removeOnComplete: config.removeOnComplete ?? true,
					removeOnFail: config.removeOnFail ?? false,
				},
			};
			return (await this.backend.put(record)) as TaskJob<T>;
		});
	}

	/**
	 * Register repeated jobs sequentially.
	 * @param tasks - Explicit task definitions; omitted input uses enabled repeated modules in the active client’s tasks
	 * store.
	 * @throws If a definition is invalid, the task store is unavailable, or storage fails.
	 */
	public async createRepeated(tasks?: RepeatedTask[]): Promise<void> {
		const entries =
			tasks ??
			container.client.modules
				.require("tasks")
				.repeatedTasks.filter((module) => module.enabled)
				.map((module) => ({
					name: module.name as TaskNameWithoutPayload,
					options: {
						repeated: true,
						...module.jobOptions,
						...(module.interval !== null
							? { interval: module.interval }
							: { pattern: module.pattern!, timezone: module.timezone }),
					} as TaskOptions,
				}));
		for (const task of entries) await this.create(task.name, task.options);
	}

	/**
	 * Read a stored job.
	 * @param id - Job ID.
	 * @returns A job snapshot, or undefined when absent. Closure and storage failures reject.
	 */
	public get(id: string): Promise<TaskRecord | undefined> {
		return this.operation(() => this.backend.get(id));
	}
	/**
	 * Delete a job to cancel future execution. Already running user code cannot be undone.
	 * @param id - Job ID.
	 * @returns Whether a record was removed. Closure and storage failures reject.
	 */
	public delete(id: string): Promise<boolean> {
		return this.operation(() => this.backend.delete(id));
	}
	/**
	 * List stored jobs by scheduled run time, then ID.
	 * @param options - Optional state filter, order, and inclusive slice.
	 * @returns Job snapshots. Closure and storage failures reject.
	 */
	public list(options: TaskListOptions = {}): Promise<TaskRecord[]> {
		return this.operation(async () =>
			this.slice(
				(await this.backend.list()).filter(
					(job) => !options.types || options.types.includes(job.state),
				),
				options,
			),
		);
	}
	/**
	 * List stored repeated jobs by next run time, then ID.
	 * @param options - Optional order and inclusive slice.
	 * @returns Repeated job snapshots. Closure and storage failures reject.
	 */
	public listRepeated(
		options: RepeatedTaskListOptions = {},
	): Promise<RepeatedTaskInfo> {
		return this.operation(async () =>
			this.slice(
				(await this.backend.list()).filter((job) => job.repeat),
				options,
			),
		);
	}
	/**
	 * Delete terminal records older than the selected timestamp.
	 * @param options - States and timestamp; defaults to completed/failed records before now.
	 * @returns Number of removed records. Closure and storage failures reject.
	 */
	public cleanup(options: TaskCleanupOptions = {}): Promise<number> {
		return this.operation(() =>
			this.backend.cleanup(
				options.states ?? ["completed", "failed"],
				options.before ?? Date.now(),
			),
		);
	}

	/**
	 * Run an enabled task module now, without storing a job or applying queued retry rules.
	 * @param task - Task name or name/payload reference.
	 * @param context - Optional caller-supplied run context.
	 * @returns Elapsed milliseconds.
	 * @throws If closed, the task is missing/disabled, or its handler throws. Lifecycle events are still emitted.
	 */
	public run(task: TaskResolvable, context?: TaskRunContext): Promise<number> {
		return this.operation(() => this.runTask(task, context));
	}

	private async runTask(
		task: TaskResolvable,
		context?: TaskRunContext,
	): Promise<number> {
		const { name, payload } = this.resolveTask(task);
		const client = container.client;
		const module = client.modules.require("tasks").get(name);
		if (!module?.enabled) {
			client.emit(TaskEvents.ScheduledTaskNotFound, name, payload);
			throw new Error(`Scheduled task "${name}" is missing or disabled.`);
		}
		let duration: number | null = null;
		try {
			client.emit(TaskEvents.ScheduledTaskRun, module, payload);
			const start = performance.now();
			const result = await module.run(payload as never, context);
			duration = performance.now() - start;
			client.emit(
				TaskEvents.ScheduledTaskSuccess,
				module,
				payload,
				result,
				duration,
			);
			return duration;
		} catch (error) {
			client.emit(TaskEvents.ScheduledTaskError, error, module, payload);
			throw error;
		} finally {
			client.emit(TaskEvents.ScheduledTaskFinished, module, duration, payload);
		}
	}

	/**
	 * Stop claiming jobs, await running work and storage operations, then close the backend.
	 * @returns One shared close promise. Running handlers are awaited rather than forcibly interrupted.
	 */
	public close(): Promise<void> {
		this.closed = true;
		clearInterval(this.timer);
		this.closing ??= (async () => {
			await this.starting?.catch(() => {});
			await this.pumping;
			await Promise.allSettled([...this.operations, ...this.running]);
			await this.backend.close();
		})();
		return this.closing;
	}

	private operation<T>(run: () => Promise<T>): Promise<T> {
		if (this.closed)
			return Promise.reject(new Error("This task scheduler is closed."));
		const pending = Promise.resolve().then(run);
		this.operations.add(pending);
		void pending.finally(() => this.operations.delete(pending)).catch(() => {});
		return pending;
	}
	private slice(
		jobs: TaskRecord[],
		options: RepeatedTaskListOptions,
	): TaskRecord[] {
		jobs.sort(
			(a, b) => a.runAt - b.runAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
		);
		if (options.asc === false) jobs.reverse();
		return jobs.slice(
			options.start ?? 0,
			options.end === undefined || options.end === -1
				? undefined
				: options.end + 1,
		);
	}
	private resolveTask(task: TaskResolvable): {
		name: string;
		payload: unknown;
	} {
		const name = typeof task === "string" ? task : task.name;
		if (typeof name !== "string" || !name.trim())
			throw new TypeError("Tasks need a non-empty name.");
		return {
			name,
			payload:
				typeof task === "string"
					? undefined
					: "payload" in task
						? task.payload
						: undefined,
		};
	}
	private pump(): Promise<void> {
		this.pumping ??= this.claimWork()
			.catch((error) => {
				if (!this.connectionFailed)
					this.report(
						"Task storage is unavailable; claims will retry without changing backends.",
						error,
						"claim",
					);
				this.connectionFailed = true;
			})
			.finally(() => {
				this.pumping = undefined;
			});
		return this.pumping;
	}
	private async claimWork(): Promise<void> {
		while (
			!this.closed &&
			this.running.size < (this.options.concurrency ?? 1)
		) {
			const job = await this.backend.claim(
				randomUUIDv7(),
				this.options.leaseDuration ?? 30000,
			);
			if (this.connectionFailed) {
				if (container.logger)
					writeEvent(container.logger, "notif", {
						component: "tasks.storage",
						event: "recovered",
						message:
							"Task storage is responding again; queued work can be claimed.",
						context: { queue: this.queue, storage: this.storage },
					});
				this.connectionFailed = false;
			}
			if (!job) break;
			if (this.closed) {
				await this.backend.settle(job.id, job.token!, {
					...job,
					state: "waiting",
				});
				break;
			}
			const work = this.execute(job).catch((error) =>
				this.report(
					`Could not settle task "${job.name}" (${job.id}); its lease can be reclaimed.`,
					error,
					"settle",
					{
						task: job.name,
						jobId: job.id,
					},
				),
			);
			this.running.add(work);
			void work.finally(() => this.running.delete(work)).catch(() => {});
		}
	}
	private async execute(job: TaskRecord): Promise<void> {
		const lease = this.options.leaseDuration ?? 30000;
		const controller = new AbortController();
		let renewal: Promise<void> | undefined;
		let deadline = Date.now() + lease;
		const heartbeat = setInterval(
			() => {
				if (renewal || controller.signal.aborted) return;
				renewal = this.backend
					.renew(job.id, job.token!, lease)
					.then((owned) => {
						if (owned) deadline = Date.now() + lease;
						else
							controller.abort(
								new Error("Task lease was lost or the job was deleted."),
							);
					})
					.catch((error) => {
						if (Date.now() >= deadline) controller.abort(error);
					})
					.finally(() => {
						renewal = undefined;
					});
			},
			Math.max(10, Math.floor(lease / 3)),
		);
		try {
			let failed = false;
			try {
				await this.run(
					{ name: job.name, payload: job.data } as TaskResolvable,
					{ signal: controller.signal, job: structuredClone(job) },
				);
			} catch (error) {
				failed = true;
				job.failures++;
				job.lastError = error instanceof Error ? error.message : String(error);
			}
			if (controller.signal.aborted) return;
			const now = Date.now();
			job.updatedAt = now;
			let next: TaskRecord | undefined = job;
			if (failed && job.failures < (job.options.attempts ?? 1)) {
				job.state = "waiting";
				job.runAt = now + (job.options.retryDelay ?? 0);
			} else if (job.repeat) {
				job.state = "waiting";
				job.runAt = nextOccurrence(job.repeat, job.scheduledAt, now);
				job.scheduledAt = job.runAt;
				job.attemptsMade = 0;
				job.failures = 0;
			} else {
				job.state = failed ? "failed" : "completed";
				if (failed ? job.options.removeOnFail : job.options.removeOnComplete)
					next = undefined;
			}
			if (!(await this.backend.settle(job.id, job.token!, next)))
				controller.abort(new Error("Task lease changed before completion."));
		} finally {
			clearInterval(heartbeat);
			await renewal;
		}
	}
	private report(
		message: string,
		cause: unknown,
		operation: "claim" | "settle",
		context: Record<string, unknown> = {},
	): void {
		const error = new Error(message, { cause });
		container.client?.emit(TaskEvents.StorageError, error);
		if (this.options.logErrors !== false && container.logger)
			writeEvent(container.logger, "error", {
				component: "tasks.storage",
				event: operation === "claim" ? "claim_failed" : "settlement_failed",
				message:
					operation === "claim"
						? "Cannot claim queued work; check storage connectivity. The configured backend will be retried."
						: "Task result could not be saved; an expired lease can allow another execution. Check storage before retrying manually.",
				error: cause,
				context: { queue: this.queue, storage: this.storage, ...context },
			});
	}
}
