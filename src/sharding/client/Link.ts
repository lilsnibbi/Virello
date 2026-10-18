import { type } from "arktype";
import { writeEvent } from "../../core/logging/diagnostics";
import type { LoggerLike } from "../../core/logging/LoggerLike";
import { ShardMessenger } from "../messaging";
import { statsRequest } from "../stats";
import { Availability } from "../transport/availability";
import { Pending } from "../transport/pending";
import {
	decode,
	encode,
	type Frame,
	failure,
	frame,
	identifier,
	type Limits,
	limits,
	timeout,
} from "../transport/protocol";
import {
	type ShardCallOptions,
	type ShardContext,
	ShardError,
	type ShardInput,
	type ShardOutput,
	type ShardRequestName,
	type ShardStats,
} from "../types";

export interface ShardConfig {
	shard: number | null;
	count: number;
	generation: string;
	limits: Limits;
	identifyTimeoutMs: number;
	shutdownTimeoutMs: number;
	assignmentPollIntervalMs?: number;
	maxDisconnectedLifetimeMs?: number;
}
/** Called only by VirelloClient; ordinary clients never read transport credentials or open connections. */
export function shardConfig(): ShardConfig | undefined {
	const input = process.env.VIRELLO_SHARD;
	if (input === undefined) return undefined;
	if (!process.send || !process.connected)
		throw new ShardError(
			"CONFIG",
			"VIRELLO_SHARD is reserved for ShardManager-owned Bun IPC children.",
		);
	if (Buffer.byteLength(input) > 8192)
		throw new ShardError("CONFIG", "Invalid managed shard configuration.");
	const result = type({
		shard: "number.integer >= 0 | null",
		count: "number.integer > 0 & number <= 4096",
		generation: identifier,
		limits: "object",
		identifyTimeoutMs: "number",
		shutdownTimeoutMs: "number",
		"assignmentPollIntervalMs?": "number.integer >= 50 & number <= 300000",
		"maxDisconnectedLifetimeMs?": "number.integer >= 1 & number <= 2147483647",
		"+": "reject",
	}).assert(JSON.parse(input));
	if (result.shard !== null && result.shard >= result.count)
		throw new ShardError("CONFIG", "Shard ID exceeds total count.");
	return {
		...result,
		limits: limits(result.limits),
		identifyTimeoutMs: timeout(result.identifyTimeoutMs),
		shutdownTimeoutMs: timeout(result.shutdownTimeoutMs),
	};
}
interface Handler {
	run(input: unknown, context: ShardContext): unknown;
	validate?: (input: unknown) => unknown;
}
interface Active {
	controller: AbortController;
	timer: ReturnType<typeof setTimeout>;
	task: Promise<void>;
}
interface Lifecycle {
	maintenance: (value: boolean) => void;
	assignment: (shard: number | null, count: number) => Promise<void>;
	available: () => void;
	logger: LoggerLike;
}

/** Typed messaging on one managed VirelloClient. Handlers run local registered code only. */
export class ShardLink extends ShardMessenger {
	private readonly handlers = new Map<string, Handler>();
	private readonly active = new Map<string, Active>();
	private readonly requests: Pending;
	private readonly availability = new Availability();
	private readonly policy: Limits;
	private started = false;
	private connected = false;
	private closed = false;
	private connectPromise?: Promise<void>;
	private closePromise?: Promise<void>;
	private heartbeat?: ReturnType<typeof setInterval>;
	private lastSeen = 0;
	private stopPromise?: Promise<void>;
	private poll?: ReturnType<typeof setInterval>;
	private outage?: ReturnType<typeof setTimeout>;
	private revision = 0;
	private appliedId?: string;
	private applying = false;
	private nextAssignment?: Frame;
	private assignmentWait?: {
		promise: Promise<void>;
		resolve: () => void;
		reject: (error: unknown) => void;
	};
	private dormantReason?: string;
	/**
	 * Created by VirelloClient. Use client.sharding to register handlers and send requests.
	 * @internal
	 */
	public constructor(
		private readonly config: ShardConfig | undefined,
		private readonly shutdown: (code: number, cause?: unknown) => Promise<void>,
		private readonly metrics?: () => { ready: boolean; guilds: number },
		private readonly lifecycle?: Lifecycle,
		private readonly statistics?: () => ShardStats,
	) {
		super();
		this.policy = config?.limits ?? limits();
		this.requests = new Pending(this.policy.maxPending);
		if (config) this.lifecycle?.maintenance(true);
	}
	/** True when this client was started as a ShardManager child. */
	public get enabled(): boolean {
		return this.config !== undefined;
	}
	/** True once the coordinator has accepted and reconciled this process's assignment. */
	public get isConnected(): boolean {
		return this.connected;
	}
	/** This process's leased Discord shard ID, or null when unmanaged or dormant. */
	public get id(): number | null {
		return this.config?.shard ?? null;
	}
	/** Total from the latest assignment. Zero for unmanaged clients; this doesn't count live peers. */
	public override get shardCount(): number {
		return this.config?.count ?? 0;
	}
	/** Number of local outgoing requests still waiting for a reply. */
	public get pendingCount(): number {
		return this.requests.size;
	}
	/**
	 * Register a local handler. Duplicate names and the built-in stats name are rejected.
	 * @param name - Name declared in ShardRequests.
	 * @param handler - Receives validated input and a cancellation context; return plain JSON output.
	 * @param validate - Optional synchronous input validator. Throw to reject the request; its return value becomes handler
	 * input.
	 * @returns An unsubscribe callback for future invocations. Already running work keeps its handler.
	 * @throws If the name or callbacks are invalid, already registered, reserved, or the link is closed.
	 */
	public handle<K extends ShardRequestName>(
		name: K,
		handler: (
			input: ShardInput<K>,
			context: ShardContext,
		) => ShardOutput<K> | Promise<ShardOutput<K>>,
		validate?: (input: unknown) => ShardInput<K>,
	): () => void {
		identifier.assert(name);
		if ((name as string) === statsRequest)
			throw new ShardError(
				"RESERVED_HANDLER",
				"The built-in stats handler cannot be replaced.",
			);
		if (this.closed) throw new ShardError("CLOSED", "Sharding is closed.");
		if (this.handlers.has(name))
			throw new ShardError(
				"DUPLICATE_HANDLER",
				`Handler ${name} is already registered.`,
			);
		if (
			typeof handler !== "function" ||
			(validate !== undefined && typeof validate !== "function")
		)
			throw new TypeError("Handler and validator must be functions.");
		const entry = { run: handler, validate };
		this.handlers.set(name, entry);
		return () => {
			if (this.handlers.get(name) === entry) this.handlers.delete(name);
		};
	}
	/**
	 * Open managed IPC and wait for a reconciled, assigned shard. Normally called by client.login().
	 * @returns The shared connection promise. Dormant children wait until assigned.
	 * @throws If unmanaged, closed, or the handshake fails.
	 */
	public connect(): Promise<void> {
		if (!this.config)
			return Promise.reject(
				new ShardError("DISABLED", "This client is not a ShardManager child."),
			);
		if (this.closed)
			return Promise.reject(new ShardError("CLOSED", "Sharding is closed."));
		if (!this.connectPromise) {
			this.started = true;
			this.lastSeen = performance.now();
			process.on("message", this.onMessage);
			process.on("disconnect", this.onDisconnect);
			process.on("SIGTERM", this.onSignal);
			this.heartbeat = setInterval(() => {
				if (performance.now() - this.lastSeen > 15000) void this.stop(1);
			}, 3000);
			this.poll = setInterval(() => {
				if (!this.connected && !this.closed) {
					try {
						this.send(frame("poll"));
					} catch (error) {
						void this.stop(1, error);
					}
				}
			}, this.config.assignmentPollIntervalMs ?? 30000);
			const boot = frame("boot");
			this.connectPromise = this.rpc(boot, {}).then(async () => {
				if (this.closed)
					throw new ShardError("CLOSED", "Closed during handshake.");
				await this.waitForAssignment();
				this.reportMetrics();
			});
		}
		return this.connectPromise;
	}
	/** Internal login lifecycle wait. Dormant processes intentionally remain alive until assigned or closed. */
	public waitForAssignment(): Promise<void> {
		if (this.closed)
			return Promise.reject(new ShardError("CLOSED", "Sharding is closed."));
		if (this.connected && this.id !== null) return Promise.resolve();
		if (!this.assignmentWait) {
			let resolve!: () => void;
			let reject!: (error: unknown) => void;
			const promise = new Promise<void>((done, fail) => {
				resolve = done;
				reject = fail;
			});
			this.assignmentWait = { promise, resolve, reject };
		}
		return this.assignmentWait.promise;
	}
	/**
	 * Wait for coordinator reconciliation when requested and deduct waiting time from the call budget.
	 * @param options - Deadline, cancellation, and wait settings.
	 * @returns Settings with the remaining timeout.
	 * @throws On closure, disconnection, exhausted wait capacity, cancellation, or timeout.
	 */
	protected override prepare(
		options: ShardCallOptions,
	): Promise<ShardCallOptions> {
		return this.availability.prepare(
			options,
			this.policy.timeoutMs,
			this.policy.maxPending - this.requests.size,
		);
	}
	/**
	 * Route one JSON request through the coordinator and await its reply.
	 * @param target - Target shard ID in the configured range.
	 * @param name - Registered request name.
	 * @param payload - Plain JSON input.
	 * @param options - Deadline and cancellation settings.
	 * @returns The handler’s output.
	 * @throws If preparation, validation, transport, or the remote handler fails.
	 */
	protected override async call(
		target: number,
		name: string,
		payload: unknown,
		options: ShardCallOptions,
	): Promise<unknown> {
		options = await this.prepare(options);
		if (!this.connected)
			throw new ShardError("DISCONNECTED", "Sharding is not connected.");
		if (!Number.isInteger(target) || target < 0 || target >= this.shardCount)
			throw new ShardError("TARGET", "Shard is outside the configured range.");
		identifier.assert(name);
		return this.rpc(
			frame("call", undefined, {
				source: this.id,
				target,
				name,
				payload,
				timeoutMs: timeout(options.timeoutMs ?? this.policy.timeoutMs),
			}),
			options,
		);
	}
	/** Used by discord.js for every IDENTIFY, including re-identification after reconnects. */
	public async waitForIdentify(
		shard: number,
		signal: AbortSignal,
	): Promise<void> {
		try {
			while (!this.closed) {
				try {
					await this.prepare({
						waitForCoordinator: true,
						timeoutMs: 300000,
						signal,
					});
					if (shard !== this.id)
						throw new ShardError(
							"IDENTIFY",
							"This process no longer owns the requested shard.",
						);
					await this.rpc(
						frame("identify", undefined, {
							shard,
							generation: this.config!.generation,
							timeoutMs: this.config!.identifyTimeoutMs,
						}),
						{ signal, timeoutMs: this.config!.identifyTimeoutMs },
					);
					break;
				} catch (error) {
					if (
						!signal.aborted &&
						!this.closed &&
						!this.connected &&
						error instanceof ShardError &&
						["DISCONNECTED", "TIMEOUT"].includes(error.code)
					)
						continue;
					throw error;
				}
			}
		} catch (error) {
			// discord.js 14's throttler catch can fall through to IDENTIFY after a non-abort failure.
			// A managed process must stop before returning such a failure to that hook.
			if (!signal.aborted) await this.stop(1, error);
			throw error;
		}
		signal.throwIfAborted();
	}
	/** READY acknowledges actual identification; the coordinator then starts the bucket cooldown. */
	public identified(): void {
		if (this.connected && !this.closed) {
			try {
				this.send(
					frame("done", undefined, {
						shard: this.id,
						generation: this.config!.generation,
					}),
				);
				this.reportMetrics();
			} catch (error) {
				void this.stop(1, error);
			}
		}
	}
	private reportMetrics(): void {
		if (this.metrics && this.connected && !this.closed)
			this.send(
				frame("metrics", undefined, {
					shard: this.id,
					generation: this.config!.generation,
					...this.metrics(),
				}),
			);
	}
	private async rpc(
		message: Frame,
		options: ShardCallOptions,
	): Promise<unknown> {
		if (!this.started || this.closed)
			throw new ShardError("DISCONNECTED", "Shard IPC is closed.");
		encode(message, this.policy.maxBytes);
		const promise = this.requests.create(
			message.id,
			options.timeoutMs ?? this.policy.timeoutMs,
			options.signal,
			() => {
				try {
					this.send(frame("cancel", message.id));
				} catch {
					/* Parent may have disconnected. */
				}
			},
		);
		if (this.requests.has(message.id)) {
			try {
				this.send(message);
			} catch (error) {
				this.requests.reject(message.id, error);
			}
		}
		return promise;
	}
	private readonly onMessage = (input: unknown): void => {
		try {
			const message = decode(input, this.policy.maxBytes, [
				"ping",
				"stop",
				"reply",
				"invoke",
				"cancel",
				"assign",
				"healthy",
				"unavailable",
			]);
			this.lastSeen = performance.now();
			switch (message.op) {
				case "unavailable":
					this.unavailable();
					return;
				case "assign":
					this.applyAssignment(message);
					return;
				case "healthy":
					if (message.id !== this.appliedId || this.closed) return;
					this.appliedId = undefined;
					this.connected = this.id !== null;
					this.availability.set(this.connected);
					clearTimeout(this.outage);
					this.outage = undefined;
					this.lifecycle?.maintenance(!this.connected);
					if (this.connected) {
						this.event(
							"notif",
							"assignment_reconciled",
							"Coordinator assignment reconciled; leaving maintenance.",
							{ shard: this.id, count: this.shardCount },
						);
						this.assignmentWait?.resolve();
						this.assignmentWait = undefined;
						this.lifecycle?.available();
						this.reportMetrics();
					}
					return;
				case "ping":
					this.send(frame("pong", message.id));
					this.reportMetrics();
					return;
				case "stop":
					void this.stop(0);
					return;
				case "reply":
					// Boot acknowledges local IPC only. A reconciled lease is required for availability.
					if (message.data.ok)
						this.requests.resolve(message.id, message.data.value);
					else
						this.requests.reject(
							message.id,
							new ShardError(
								message.data.error.code,
								message.data.error.message,
							),
						);
					return;
				case "cancel":
					this.active
						.get(message.id)
						?.controller.abort(
							new ShardError("ABORTED", "Caller cancelled or timed out."),
						);
					return;
				case "invoke":
					this.invoke(message);
					return;
			}
		} catch (error) {
			void this.stop(1, error);
		}
	};
	private event(
		level: keyof LoggerLike,
		event: string,
		message: string,
		context: Record<string, unknown>,
	): void {
		if (this.lifecycle)
			writeEvent(this.lifecycle.logger, level, {
				component: "sharding.client",
				event,
				message,
				context,
			});
	}
	private armOutage(): void {
		if (this.outage || this.closed) return;
		this.outage = setTimeout(() => {
			void this.stop(
				1,
				new ShardError(
					"COORDINATOR_TIMEOUT",
					"Coordinator reconciliation deadline expired; restarting the entire shard process.",
				),
			);
		}, this.config?.maxDisconnectedLifetimeMs ?? 900000);
	}
	private unavailable(): void {
		const wasConnected = this.connected;
		this.connected = false;
		this.appliedId = undefined;
		this.revision++;
		this.availability.set(false);
		this.lifecycle?.maintenance(true);
		this.requests.close();
		if (this.id !== null) this.armOutage();
		if (wasConnected)
			this.event(
				"alert",
				"maintenance_started",
				"Coordinator unavailable; keeping Discord connected while retrying.",
				{
					shard: this.id,
					maxDisconnectedLifetimeMs:
						this.config?.maxDisconnectedLifetimeMs ?? 900000,
				},
			);
	}
	private applyAssignment(message: Frame): void {
		if (!this.config || this.closed) return;
		if (this.applying) {
			// Reconnects can overtake a slow gateway close. Retain only the latest replacement instruction.
			this.nextAssignment = message;
			return;
		}
		this.applying = true;
		const { shard, count, reason } = message.data as {
			shard: number | null;
			count: number;
			reason: string;
		};
		if (shard !== null && shard >= count)
			throw new ShardError(
				"PROTOCOL",
				"Assigned shard ID is outside the current count.",
			);
		const revision = ++this.revision;
		this.connected = false;
		this.appliedId = undefined;
		this.availability.set(false);
		this.lifecycle?.maintenance(true);
		if (shard !== null) this.armOutage();
		void Promise.resolve()
			.then(async () => {
				if (this.closed) return;
				const previous = this.config!.shard;
				await this.lifecycle?.assignment(shard, count);
				this.config!.shard = shard;
				this.config!.count = count;
				if (shard === null) {
					clearTimeout(this.outage);
					this.outage = undefined;
					if (previous !== null || this.dormantReason !== reason)
						this.event(
							"alert",
							"shard_dormant",
							"No valid lease; old Discord session closed. Waiting for an available shard slot.",
							{
								previousShard: previous,
								reason,
								pollIntervalMs: this.config!.assignmentPollIntervalMs ?? 30000,
							},
						);
					this.dormantReason = reason;
				} else this.dormantReason = undefined;
				if (this.closed) return;
				if (revision === this.revision) this.appliedId = message.id;
				this.send(frame("applied", message.id));
			})
			.catch((error) => {
				void this.stop(1, error);
			})
			.finally(() => {
				this.applying = false;
				const next = this.nextAssignment;
				this.nextAssignment = undefined;
				if (next) this.applyAssignment(next);
			});
	}
	/** Fail the entire managed process when its gateway lifecycle cannot be completed safely. */
	public terminate(cause: unknown): Promise<void> {
		return this.stop(1, cause);
	}
	private readonly onDisconnect = (): void => {
		void this.stop(1);
	};
	private readonly onSignal = (): void => {
		void this.stop(0);
	};
	private invoke(message: Frame<"invoke">): void {
		if (
			!this.connected ||
			this.closed ||
			message.data.target !== this.id ||
			message.data.generation !== this.config!.generation
		)
			throw new ShardError(
				"PROTOCOL",
				"Invocation targets a different process.",
			);
		if (this.active.has(message.id))
			throw new ShardError("PROTOCOL", "Duplicate invocation.");
		const handler: Handler | undefined =
			message.data.name === statsRequest
				? {
						run: () => {
							if (!this.statistics)
								throw new ShardError(
									"UNAVAILABLE",
									"This process has no statistics provider.",
								);
							return this.statistics();
						},
					}
				: this.handlers.get(message.data.name);
		const reply = (result: unknown) => {
			if (!this.closed)
				this.send(
					frame("result", message.id, {
						shard: this.id,
						generation: this.config!.generation,
						result,
					}),
				);
		};
		if (!handler || this.active.size >= this.policy.maxPending) {
			reply(
				failure(
					new ShardError(
						handler ? "CAPACITY" : "NO_HANDLER",
						handler
							? "Handler capacity reached."
							: `Unknown handler ${message.data.name}.`,
					),
				),
			);
			return;
		}
		const controller = new AbortController();
		const timer = setTimeout(
			() =>
				controller.abort(
					new ShardError("TIMEOUT", "Handler deadline elapsed."),
				),
			timeout(message.data.timeoutMs),
		);
		const task = Promise.resolve()
			.then(async () => {
				try {
					const input = handler.validate
						? handler.validate(message.data.payload)
						: message.data.payload;
					const value = await handler.run(input, {
						source: message.data.source === -1 ? null : message.data.source,
						signal: controller.signal,
					});
					if (!controller.signal.aborted) reply({ ok: true, value });
				} catch (error) {
					if (!controller.signal.aborted) reply(failure(error));
				}
			})
			.catch(() => {
				void this.stop(1);
			})
			.finally(() => {
				clearTimeout(timer);
				this.active.delete(message.id);
			});
		// Keep abandoned/hung handlers counted until they actually finish, preventing unbounded work.
		this.active.set(message.id, { controller, timer, task });
	}
	private send(message: Frame): void {
		if (!process.connected || !process.send)
			throw new ShardError("DISCONNECTED", "Parent IPC is disconnected.");
		process.send(encode(message, this.policy.maxBytes));
	}
	private stop(code: number, cause?: unknown): Promise<void> {
		return (this.stopPromise ??= (async () => {
			const deadline = setTimeout(
				() => process.exit(1),
				this.config?.shutdownTimeoutMs ?? 5000,
			);
			try {
				await this.shutdown(code, cause);
			} catch {
				code = 1;
			}
			clearTimeout(deadline);
			// Managed children explicitly give their supervisor process-lifecycle ownership.
			process.exit(code);
		})());
	}
	/**
	 * Stop IPC listeners and timers, reject pending work, and abort running handlers.
	 * @returns The shared close promise, waiting briefly for handlers to settle. Normally called by client.destroy().
	 */
	public close(): Promise<void> {
		this.closed = true;
		this.connected = false;
		return (this.closePromise ??= this.finish());
	}
	private async finish(): Promise<void> {
		clearInterval(this.heartbeat);
		clearInterval(this.poll);
		clearTimeout(this.outage);
		this.availability.close();
		this.assignmentWait?.reject(
			new ShardError("CLOSED", "Sharding is closed."),
		);
		this.assignmentWait = undefined;
		process.off("message", this.onMessage);
		process.off("disconnect", this.onDisconnect);
		process.off("SIGTERM", this.onSignal);
		this.requests.close();
		this.handlers.clear();
		for (const entry of this.active.values()) {
			clearTimeout(entry.timer);
			entry.controller.abort(new ShardError("CLOSED", "Client closing."));
		}
		if (this.active.size) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					Promise.allSettled([...this.active.values()].map((v) => v.task)),
					new Promise<void>((done) => {
						timer = setTimeout(
							done,
							Math.min(1000, this.config?.shutdownTimeoutMs ?? 1000),
						);
					}),
				]);
			} finally {
				clearTimeout(timer);
			}
		}
		if (this.started && process.connected) process.disconnect?.();
	}
}
