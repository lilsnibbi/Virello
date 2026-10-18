import type { LoggerLike } from "../core/logging/LoggerLike";

/** Add named { input, output } request contracts by augmenting virello. Inputs and outputs must be plain JSON values. */
export interface ShardRequests {}
/** Names declared in ShardRequests. */
export type ShardRequestName = keyof ShardRequests & string;
/** Input value for one named shard request. */
export type ShardInput<K extends ShardRequestName> = ShardRequests[K] extends {
	/** Input type declared by the request contract. */
	input: infer I;
}
	? I
	: never;
/** Reply value for one named shard request. */
export type ShardOutput<K extends ShardRequestName> = ShardRequests[K] extends {
	/** Output type declared by the request contract. */
	output: infer O;
}
	? O
	: never;
/** Deadline, cancellation, and coordinator-wait settings for one messaging operation. */
export interface ShardCallOptions {
	/** Whole operation budget in milliseconds, including an optional coordinator wait. Defaults to limits.timeoutMs. */
	timeoutMs?: number;
	/** Stop waiting for a reply. Already running handlers should also watch their context signal. */
	signal?: AbortSignal;
	/** Wait for local coordinator reconciliation within timeoutMs. Default false; sent calls are never replayed. */
	waitForCoordinator?: boolean;
}
/** Origin and cancellation state passed to a shard request handler. */
export interface ShardContext {
	/** Originating shard ID, or null for a request from a host supervisor. */
	readonly source: number | null;
	/** Aborts on cancellation, timeout, disconnect, or shutdown. Handlers must stop their own work when aborted. */
	readonly signal: AbortSignal;
}
/** One broadcast result. Check ok before reading value or error. */
export type ShardResult<T> =
	| {
			/** Target Discord shard ID. */
			shard: number;
			/** True for a successful reply; false when this shard could not answer. */
			ok: true;
			/** Handler output, present only when ok is true. */
			value: T;
	  }
	| {
			/** Target Discord shard ID. */
			shard: number;
			/** True for a successful reply; false when this shard could not answer. */
			ok: false;
			/** Request failure, present only when ok is false. */
			error: ShardError;
	  };
/** A fresh sample taken inside one shard process when it receives your stats request. */
export interface ShardStats {
	/** Unix milliseconds on the shard's clock. Samples from different machines aren't an atomic snapshot. */
	readonly sampledAt: number;
	/** Whether this shard's Discord client is ready at sampling time. */
	readonly ready: boolean;
	/** Current number of guilds in this shard’s client cache. */
	readonly guilds: number;
	/** Current number of cached users. The same user may be cached by several shards. */
	readonly users: number;
	/** Current number of channels in this shard’s client cache. */
	readonly channels: number;
	/** Latest gateway heartbeat latency in milliseconds, or null before a measurement is available. */
	readonly pingMs: number | null;
	/** Milliseconds since the client last became ready, or null while it isn't ready. */
	readonly uptimeMs: number | null;
	/** OS process ID on this shard's host. PIDs aren't unique across hosts. */
	readonly pid: number;
	/** Milliseconds since this Bun process started, independent of Discord reconnects. */
	readonly processUptimeMs: number;
	/** Process memory in bytes. These fields overlap; don't add them together. */
	readonly memory: {
		/** Resident process memory in bytes, including the heap and native allocations. */
		readonly rss: number;
		/** Bytes currently allocated for the JavaScript heap. */
		readonly heapTotal: number;
		/** Bytes currently used in the JavaScript heap. */
		readonly heapUsed: number;
		/** Bytes used by native allocations associated with JavaScript objects. */
		readonly external: number;
		/** Bytes used by ArrayBuffer and Buffer storage; included in external memory. */
		readonly arrayBuffers: number;
	};
}
/** Check ok before reading value. Failed shards have an error and no substitute metrics. */
export type ShardStatsResult =
	| {
			/** Target Discord shard ID. */
			readonly shard: number;
			/** True for a fresh sample; false for a failed shard request. */
			readonly ok: true;
			/** Frozen live sample, present only when ok is true. */
			readonly value: ShardStats;
	  }
	| {
			/** Target Discord shard ID. */
			readonly shard: number;
			/** True for a fresh sample; false for a failed shard request. */
			readonly ok: false;
			/** Frozen failure copy, present only when ok is false. No cached sample replaces it. */
			readonly error: Readonly<ShardError>;
	  };
/** Sharding failure with a machine-readable code and a short message. */
export class ShardError extends Error {
	/**
	 * Create a sharding failure.
	 * @param code - Failure category, such as TIMEOUT or DISCONNECTED.
	 * @param message - Explanation of the failure.
	 */
	public constructor(
		/** Machine-readable sharding failure category. */
		public readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "ShardError";
	}
}
/** Bounds applied to sharding messages and in-flight work. */
export interface ShardLimits {
	/** Maximum encoded frame size in bytes (1024..1048576). Defaults to 65536. */
	maxBytes?: number;
	/** Maximum in-flight operations and running handlers (1..4096). Defaults to 256. */
	maxPending?: number;
	/** Maximum outgoing WebSocket buffer in bytes (1024..16777216). Must cover maxBytes. Defaults to 262144. */
	maxBufferedBytes?: number;
	/** Default request deadline in milliseconds (1..300000). Defaults to 15000. */
	timeoutMs?: number;
}
/** Fresh Discord session-start metadata. Manual snapshots never refill themselves when the reset interval passes. */
export interface ShardSessionLimit {
	/** Total session starts allowed in the Discord session window. */
	total: number;
	/** Unused session starts in that window; cannot exceed total. */
	remaining: number;
	/** Milliseconds remaining before Discord’s session window resets. */
	reset_after: number;
	/** Number of identify buckets Discord allows to run concurrently. */
	max_concurrency: number;
}
/** Authenticated deployment host and its initial shard placement. */
export interface ShardHost {
	/** Unique host identifier, shared with its ShardManager. Use 1..128 letters, digits, colons, underscores, or dashes. */
	id: string;
	/** Shared host secret: 32..512 printable ASCII characters. This is separate from the Discord bot token. */
	token: string;
	/** Initial placement preferences. Actual ownership is leased per process. */
	shards: readonly number[];
	/** Capacity for new allocations; returning valid IDs are retained. Required with automatic scaling. */
	maxShards?: number;
	/** Relative host resource weight for allocation, default 1. */
	weight?: number;
}
/** Opt-in scaling policy for existing hosts. Capacity must already exist; no machines are provisioned. */
export interface ShardScalingOptions {
	/** Upper deployment bound, required. No machines are provisioned. */
	maxShards: number;
	/** Minimum shard count (1..4096). Defaults to 1. */
	minShards?: number;
	/** Optional average guild target (0..2500). Zero disables this target. Counts respect Discord’s recommendation multiple. */
	targetGuildsPerShard?: number;
	/** Metadata polling interval, at least 60 seconds; default 5 minutes. */
	pollIntervalMs?: number;
	/** Minimum interval between changes, at least 60 seconds; default 30 minutes. */
	cooldownMs?: number;
	/** Consecutive matching decisions before changing topology, default 3. */
	confirmations?: number;
	/** Allow the policy to reduce the shard count. Defaults to true. */
	allowDownscale?: boolean;
	/** Required reduction in peak weighted host load for an allocation-only change, default 0.25. */
	rebalanceThreshold?: number;
	/** Retain this many unused session starts beyond the proposed deployment, default 0. */
	sessionReserve?: number;
	/** Deadline in milliseconds for hosts to drain during a topology change (100..300000). Defaults to 30000. */
	drainTimeoutMs?: number;
	/** Deadline in milliseconds for the new topology to become ready (100..3600000). Defaults to 300000. */
	readyTimeoutMs?: number;
}
/** Snapshot of the coordinator’s current scaling phase. */
export interface ShardScalingStatus {
	/** Disabled, idle, draining old assignments, starting new assignments, or degraded after a failed transition. */
	phase: "disabled" | "idle" | "draining" | "starting" | "degraded";
	/** Current configured Discord shard count. */
	shardCount: number;
	/** Proposed shard count while a change is being tracked, when available. */
	targetShards?: number;
	/** Short explanation of the current phase or last scaling decision, when available. */
	reason?: string;
}
/** Coordinator listener, authenticated hosts, and Discord session allowance. */
export interface ShardCoordinatorOptions {
	/** Initial total Discord shard count (1..4096). Assign each ID exactly once across workers. */
	shardCount: number;
	/** Configured supervisor hosts and assignments, not JavaScript Worker threads. */
	workers: readonly ShardHost[];
	/** Opt-in automatic recommendations and capacity-aware allocation; requires botToken. */
	scaling?: ShardScalingOptions;
	/** Listener address. Defaults to 127.0.0.1. Non-loopback addresses require tls. */
	hostname?: string;
	/** Listener port (0..65535). Defaults to 8080; 0 chooses an available port. */
	port?: number;
	/** Bun TLS listener options. Required when listening beyond loopback. */
	tls?: Bun.TLSOptions;
	/** Explicitly enables GET /gateway/bot at startup and session reset. Never sent to hosts. */
	botToken?: string;
	/** Offline/manual alternative. Supply fresh metadata on every start; expires without automatic refill. */
	sessionStartLimit?: ShardSessionLimit;
	/** Message, buffer, concurrency, and deadline limits. Omitted fields use ShardLimits defaults. */
	limits?: ShardLimits;
	/** Logger to reuse without taking ownership. Defaults to an owned Virello console logger. */
	logger?: LoggerLike;
}
/** Child crash recovery settings. Delays use exponential backoff with jitter. */
export interface ShardRecovery {
	/** Consecutive restarts before stopping the shard, default 5. */
	maxRestarts?: number;
	/** Initial restart delay in milliseconds (50..300000). Defaults to 1000. */
	initialDelayMs?: number;
	/** Maximum restart delay in milliseconds, at least initialDelayMs and at most 300000. Defaults to 30000. */
	maxDelayMs?: number;
	/** Reset the crash count only after this much uninterrupted uptime, default 60 seconds. */
	stableAfterMs?: number;
}
/** Local process supervisor and its connection to one coordinator. */
export interface ShardManagerOptions {
	/** Host ID matching a configured coordinator worker. */
	id: string;
	/** Coordinator ws(s)://host:port/sharding URL, without credentials, query, or fragment. Remote hosts require wss. */
	url: string;
	/** Shared host secret matching the coordinator’s host entry. */
	token: string;
	/** Local .ts entrypoint, one Bun child per assigned Discord shard. */
	script: string | URL;
	/** Working directory for child processes and relative script resolution. Defaults to process.cwd(). */
	cwd?: string;
	/** Arguments passed after the child entrypoint. Defaults to an empty list. */
	args?: readonly string[];
	/**
	 * Child environment overrides, merged with the current process environment. Managed sharding configuration is supplied by
	 * the supervisor.
	 */
	env?: Record<string, string | undefined>;
	/** Child crash recovery settings, or false to disable restarts. Enabled with ShardRecovery defaults when omitted. */
	restart?: false | ShardRecovery;
	/** Initial connection/admission waits and later reconnection are independent of child restart; default enabled without an attempt limit. */
	reconnect?:
		| false
		| {
				/** Initial coordinator reconnect delay in milliseconds (50..300000). Defaults to 500. */
				initialDelayMs?: number;
				/** Maximum coordinator reconnect delay in milliseconds, at least initialDelayMs and at most 300000. Defaults to 30000. */
				maxDelayMs?: number;
		  };
	/** Deadline for each coordinator handshake or child boot attempt in milliseconds (1..300000). Defaults to 30000. */
	startupTimeoutMs?: number;
	/** Grace period for each shutdown stage in milliseconds (1..300000). Defaults to 5000. */
	shutdownTimeoutMs?: number;
	/** Each attempt, including queueing and re-identification; default 120 seconds. */
	identifyTimeoutMs?: number;
	/** Dormant assignment polling, default 30 seconds (50..300000ms). */
	assignmentPollIntervalMs?: number;
	/** Maximum unreconciled lifetime of an assigned process, default 15 minutes (1..2147483647ms). */
	maxDisconnectedLifetimeMs?: number;
	/** Optional minimum local process pool, including standby capacity. Must fit the host's configured maxShards. */
	processCount?: number;
	/** Logger to reuse without taking ownership. Defaults to an owned Virello console logger. */
	logger?: LoggerLike;
}
/** Copy of one local process slot’s latest supervisor state. */
export interface ShardProcessStatus {
	/** Stable local process slot; independent of the leased Discord shard ID. */
	slot: number;
	/** Leased Discord shard ID, or null for a dormant or unassigned slot. */
	shard: number | null;
	/** Current slot lifecycle state. Maintenance keeps the process alive while coordinator assignment is unreconciled. */
	state:
		| "starting"
		| "running"
		| "maintenance"
		| "dormant"
		| "backoff"
		| "failed"
		| "stopped";
	/** Local OS process ID, or null when no child process is attached. */
	pid: number | null;
	/** Consecutive recovery attempts, reset after stable uninterrupted uptime. */
	restarts: number;
}
