import { setTimeout as wait } from "node:timers/promises";
import { type } from "arktype";
import {
	assignmentSchema,
	permitSchema,
	sameAssignment,
	type ShardAssignment,
	type IdentifyOutcome,
} from "../authority";
import type { $GatewayPermit } from "@virello/ws";
import { RemoteRestScheduler } from "../rest/RemoteRestScheduler";
import { writeEvent } from "@virello/logging/diagnostics";
import type { LoggerLike } from "@virello/logging/LoggerLike";
import { ShardMessenger } from "../messaging";
import { freezeSnapshot } from "../lifecycle";
import { statsRequest } from "../stats";
import { Availability } from "../transport/availability";
import { Pending } from "../transport/pending";
import { IpcWindow } from "../transport/IpcWindow";
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
	type ShardClientStatus,
	type ShardClientEvent,
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
	released?: () => Promise<void>;
	block?: (code: string) => void;
	logger: LoggerLike;
}

/** Typed messaging on one managed VirelloClient. Handlers run local registered code only. */
export class ShardLink extends ShardMessenger<ShardClientEvent> {
	/** @internal Managed HTTP effect capability; construction opens no network connection. */
	public readonly restScheduler = new RemoteRestScheduler();
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
	private revision = 0;
	private appliedId?: string;
	private authority?: string;
	private assignment?: ShardAssignment;
	private readonly outcomes = new Map<string, IdentifyOutcome>();
	private readonly revokePermits = new Set<() => void>();
	private flushing?: Promise<void>;
	private releaseBarrier?: (signal: AbortSignal) => Promise<void>;
	private releasing?: Promise<void>;
	private readonly released = new Set<string>();
	private applying = false;
	private nextAssignment?: Frame<"assign">;
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
		private readonly metrics?: () => {
			ready: boolean;
			applicationReady?: boolean;
			guilds: number;
			gatewayState?: string;
			blockedCode?: string;
		},
		private readonly lifecycle?: Lifecycle,
		private readonly statistics?: () => ShardStats,
	) {
		super();
		this.policy = config?.limits ?? limits();
		this.delivery = new IpcWindow(this.policy);
		this.requests = new Pending(this.policy.maxPending);
		if (config) this.lifecycle?.maintenance(true);
	}
	/** True when this client was started as a ShardManager child. */
	public get enabled(): boolean {
		return this.config !== undefined;
	}
	/**
	 * Supply the application's effect barrier for reusable-worker release. It must quiesce retained handlers, timers,
	 * database writes and delegated jobs, not merely request cancellation. Without this hook a live release stays unknown.
	 * @param barrier - Idempotent drain hook; rejection/timeout never authorizes a successor.
	 */
	public onRelease(barrier: (signal: AbortSignal) => Promise<void>): void {
		if (this.releaseBarrier || typeof barrier !== "function")
			throw new ShardError(
				"CONFIG",
				"Register one application release barrier.",
			);
		this.releaseBarrier = barrier;
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
	/** Detached assignment and RPC status; this is not Discord gateway readiness. */
	public get status(): ShardClientStatus {
		return freezeSnapshot({
			enabled: this.enabled,
			connected: this.connected,
			closed: this.closed,
			shard: this.id,
			shardCount: this.shardCount,
			pendingCount: this.pendingCount,
			activeHandlers: this.active.size,
		});
	}
	private publishStatus(): void {
		this.publishLifecycle({ type: "status", status: this.status });
	}
	protected override lifecycleListenerError(error: unknown): void {
		if (this.lifecycle)
			writeEvent(this.lifecycle.logger, "error", {
				component: "sharding.client",
				event: "lifecycle_listener_failed",
				message: "A sharding lifecycle observer failed.",
				error,
			});
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
				if (performance.now() - this.lastSeen > 15000) this.unavailable(true);
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
		target: number | { guildId: string },
		name: string,
		payload: unknown,
		options: ShardCallOptions,
	): Promise<unknown> {
		options = await this.prepare(options);
		target = this.resolveTarget(target);
		if (!this.connected)
			throw new ShardError("DISCONNECTED", "Sharding is not connected.");
		if (!Number.isInteger(target) || target < 0 || target >= this.shardCount)
			throw new ShardError("TARGET", "Shard is outside the configured range.");
		identifier.assert(name);
		return this.rpc(
			frame("call", undefined, {
				authority: this.authority,
				source: this.id,
				target,
				name,
				payload,
				timeoutMs: timeout(options.timeoutMs ?? this.policy.timeoutMs),
			}),
			options,
		);
	}
	/** Used by Virello's gateway for every IDENTIFY, including re-identification after reconnects. */
	public async waitForIdentify(
		shard: number,
		signal: AbortSignal,
	): Promise<$GatewayPermit> {
		while (!this.closed) {
			let revoke: (() => void) | undefined;
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
				await this.flushOutcomes();
				if (!this.assignment || this.outcomes.size >= this.policy.maxPending)
					throw new ShardError(
						"ADMISSION_CAPACITY",
						"Assignment or outcome reconciliation unavailable.",
					);
				const assignment = this.assignment;
				const revision = this.revision;
				const attemptId = crypto.randomUUID();
				const deadline = performance.now() + 15000;
				let finished = false;
				let consuming = false;
				const settle = (kind: IdentifyOutcome["kind"]) => {
					if (finished) return;
					finished = true;
					signal.removeEventListener("abort", cancel);
					this.revokePermits.delete(cancel);
					this.outcomes.set(attemptId, { assignment, attemptId, kind });
					void this.flushOutcomes().catch(() => {});
				};
				const cancel = () => settle("revokedBeforeSend");
				revoke = cancel;
				this.revokePermits.add(cancel);
				signal.addEventListener("abort", cancel, { once: true });
				const result = await this.rpc(
					frame("identify", undefined, {
						authority: this.authority,
						shard,
						generation: this.config!.generation,
						timeoutMs: 15000,
						assignment,
						attemptId,
					}),
					{ signal, timeoutMs: 15000 },
				);
				const permit = permitSchema.assert(result);
				if (
					permit.attemptId !== attemptId ||
					!sameAssignment(permit.assignment, assignment)
				)
					throw new ShardError(
						"PROTOCOL",
						"Admission response does not match this attempt.",
					);
				signal.throwIfAborted();
				return {
					consume: (write) => {
						if (consuming)
							throw new ShardError(
								"PERMIT_EXPIRED",
								"IDENTIFY permit was already consumed.",
							);
						if (
							finished ||
							signal.aborted ||
							!this.connected ||
							revision !== this.revision ||
							performance.now() >= deadline
						) {
							cancel();
							throw new ShardError(
								"PERMIT_EXPIRED",
								"IDENTIFY permission expired or was revoked before send.",
							);
						}
						consuming = true;
						this.revokePermits.delete(cancel);
						signal.removeEventListener("abort", cancel);
						try {
							return write();
						} finally {
							settle("sent");
						}
					},
				};
			} catch (error) {
				revoke?.();
				if (
					!signal.aborted &&
					!this.closed &&
					error instanceof ShardError &&
					[
						"DISCONNECTED",
						"TIMEOUT",
						"IDENTIFY_TIMEOUT",
						"UNAVAILABLE",
						"RESHARDING",
						"RECOVERING",
					].includes(error.code)
				) {
					await wait(1000, undefined, { signal });
					continue;
				}
				throw error;
			}
		}
		signal.throwIfAborted();
		throw new ShardError("CLOSED", "Sharding is closed.");
	}
	private flushOutcomes(): Promise<void> {
		return (this.flushing ??= (async () => {
			if (!this.connected || this.closed) return;
			for (const [id, outcome] of this.outcomes) {
				await this.rpc(frame("permitOutcome", undefined, outcome), {
					timeoutMs: 10000,
				});
				this.outcomes.delete(id);
			}
		})().finally(() => {
			this.flushing = undefined;
		}));
	}
	/** READY reports application/Gateway progress; permit consumption is acknowledged at the send boundary. */
	public identified(): void {
		if (this.connected && !this.closed) {
			try {
				this.send(
					frame("done", undefined, {
						authority: this.authority,
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
		if (this.metrics && this.authority && this.id !== null && !this.closed)
			this.send(
				frame("metrics", undefined, {
					authority: this.authority,
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
	private readonly delivery: IpcWindow;
	private readonly onMessage = (input: unknown): void => {
		try {
			const message = decode(input, this.policy.maxBytes, [
				"receipt",
				"ping",
				"stop",
				"reply",
				"invoke",
				"cancel",
				"assign",
				"healthy",
				"unavailable",
				"revoke",
				"releaseAssignment",
				"gatewayBlock",
			]);
			if (!this.delivery.receive(message, (receipt) => this.send(receipt)))
				return;
			this.lastSeen = performance.now();
			switch (message.op) {
				case "gatewayBlock":
					this.lifecycle?.block?.(message.data.code);
					return;
				case "releaseAssignment":
					this.releaseAssignment(message);
					return;
				case "unavailable":
					this.unavailable();
					return;
				case "revoke":
					this.unavailable(true);
					return;
				case "assign":
					this.applyAssignment(message);
					return;
				case "healthy":
					if (message.id !== this.appliedId || this.closed) return;
					this.appliedId = undefined;
					this.authority = message.id;
					this.connected = this.id !== null;
					this.availability.set(this.connected);
					if (this.connected) this.lifecycle?.maintenance(false);
					this.publishStatus();
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
					void this.flushOutcomes().catch(() => {});
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
	private releaseAssignment(message: Frame<"releaseAssignment">): void {
		const reply = (status: "released" | "unknown", reason = "") =>
			this.send(frame("releaseResult", message.id, { status, reason }));
		if (this.released.has(message.id)) {
			reply("released");
			return;
		}
		if (
			!this.assignment ||
			!sameAssignment(message.data.assignment, this.assignment)
		) {
			reply("unknown", "Release targets an obsolete assignment.");
			return;
		}
		if (this.releasing) {
			reply("unknown", "An earlier barrier is still running.");
			return;
		}
		this.unavailable(true);
		const signal = AbortSignal.timeout(message.data.timeoutMs);
		this.releasing = (async () => {
			if (!this.releaseBarrier)
				throw new ShardError(
					"RELEASE_UNKNOWN",
					"No application effect barrier is registered.",
				);
			await this.releaseBarrier(signal);
			await Promise.all([...this.active.values()].map((entry) => entry.task));
			await this.lifecycle?.released?.();
			signal.throwIfAborted();
			this.assignment = undefined;
			this.config!.shard = null;
			this.released.add(message.id);
			if (this.released.size > 128)
				this.released.delete(this.released.values().next().value!);
			reply("released");
		})()
			.catch((error) => {
				reply(
					"unknown",
					error instanceof Error
						? error.message.slice(0, 500)
						: "Effect barrier failed.",
				);
			})
			.finally(() => {
				this.releasing = undefined;
			});
		void this.releasing.catch(() => this.onDisconnect());
	}
	private unavailable(revoke = false): void {
		const wasConnected = this.connected;
		this.connected = false;
		this.appliedId = undefined;
		if (revoke) this.authority = undefined;
		this.nextAssignment = undefined;
		this.revision++;
		this.availability.set(false);
		for (const cancel of [...this.revokePermits]) cancel();
		if (revoke) this.lifecycle?.maintenance(true);
		if (revoke) this.restScheduler.revoke();
		this.requests.close();
		for (const entry of this.active.values())
			entry.controller.abort(
				new ShardError("DISCONNECTED", "Coordinator unavailable."),
			);
		this.publishStatus();
		if (wasConnected)
			this.event(
				"alert",
				"maintenance_started",
				"Control unavailable; retaining committed ownership and waiting for new admission authority.",
				{ shard: this.id },
			);
	}
	private applyAssignment(message: Frame<"assign">): void {
		if (!this.config || this.closed) return;
		this.unavailable(message.data.shard === null);
		if (this.applying) {
			// Reconnects can overtake a slow gateway close. Retain only the latest replacement instruction.
			this.nextAssignment = message;
			return;
		}
		this.applying = true;
		const { shard, count, reason, assignment } = message.data;
		if (assignment) {
			assignmentSchema.assert(assignment);
			if (
				assignment.workerBootId !== this.config.generation ||
				(shard !== null &&
					(shard !== assignment.shardId || count !== assignment.totalShards))
			)
				throw new ShardError(
					"OWNERSHIP",
					"Assignment targets another worker or layout.",
				);
			this.assignment = assignment;
			if (message.data.rest && shard !== null)
				this.restScheduler.configure(assignment, message.data.rest);
		}
		if (shard !== null && shard >= count)
			throw new ShardError(
				"PROTOCOL",
				"Assigned shard ID is outside the current count.",
			);
		const revision = ++this.revision;
		void Promise.resolve()
			.then(async () => {
				if (this.closed || revision !== this.revision) return;
				const previous = this.config!.shard;
				await this.lifecycle?.assignment(shard, count);
				if (this.closed || revision !== this.revision) return;
				this.config!.shard = shard;
				this.config!.count = count;
				this.publishStatus();
				if (shard === null) {
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
				if (!this.closed && revision === this.revision)
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
			!this.assignment ||
			!sameAssignment(this.assignment, message.data.assignment)
		) {
			if (!this.closed)
				this.send(
					frame("result", message.id, {
						shard: message.data.target,
						generation: message.data.generation,
						result: failure(
							new ShardError("DISCONNECTED", "Shard authority is unavailable."),
						),
					}),
				);
			return;
		}
		if (
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
		this.delivery.send(message, (encoded) => process.send!(encoded));
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
		this.restScheduler.revoke();
		this.closed = true;
		this.connected = false;
		return (this.closePromise ??= this.finish());
	}
	private async finish(): Promise<void> {
		clearInterval(this.heartbeat);
		clearInterval(this.poll);
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
		this.closeLifecycle({ type: "status", status: this.status });
	}
}
