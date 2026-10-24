import type {
	GatewaySendPayload,
	GatewayPresenceUpdateData,
} from "discord-api-types/v10";
import {
	GatewayDispatchEvents as E,
	GatewayOpcodes as Op,
} from "discord-api-types/v10";
import {
	type $Clock,
	errorOf,
	integer,
	systemClock,
} from "@virello/util/runtime";
import { Heartbeat } from "./Heartbeat";
import { decodeFrame, gatewayURL } from "./protocol";
import type { $GatewayDispatch } from "./types";

/** WebSocket members needed by one engine shard. Custom factories must provide browser-style callbacks and send/close methods. */
export type $GatewaySocket = Pick<
	WebSocket,
	| "binaryType"
	| "readyState"
	| "onopen"
	| "onmessage"
	| "onclose"
	| "onerror"
	| "send"
	| "close"
>;
/** Lifecycle state of a gateway shard, from idle through connection, recovery, and closure. */
export type $GatewayState =
	| "idle"
	| "connecting"
	| "waiting_admission"
	| "identifying"
	| "resuming"
	| "ready"
	| "reconnecting"
	| "blocked"
	| "closed";
/** One-shot admission capability, consumed synchronously at the IDENTIFY write boundary. */
export interface $GatewayPermit {
	/** Validate and consume the grant immediately before executing one local socket write. */
	consume(write: () => boolean): boolean;
}
/** Terminal protocol/retry circuit state; the surrounding runtime remains inspectable. */
export class GatewayBlockedError extends Error {
	public constructor(
		message: string,
		public readonly code: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "GatewayBlockedError";
	}
}
/** Authentication, transport, and recovery settings for one gateway shard. */
export interface $GatewayOptions {
	/** Discord bot token used for IDENTIFY and RESUME. */
	token: string;
	/** Gateway WebSocket URL. TLS is required outside loopback test servers. */
	url: string;
	/** Nonnegative safe integer bitfield of Discord gateway intents. */
	intents: number;
	/** Tuple of zero-based shard ID and total shard count. Defaults to [0, 1]. */
	shard?: readonly [number, number];
	/** Native presence included with fresh IDENTIFY payloads. */
	presence?: GatewayPresenceUpdateData;
	/** Clock and timer hooks. Defaults to performance.now, Math.random, and native timers. */
	clock?: $Clock;
	/** Create a WebSocket for the supplied gateway URL. Defaults to new WebSocket(url). */
	socket?: (url: string) => $GatewaySocket;
	/** Wait for an identify permit. Called before each fresh IDENTIFY; reject or observe the signal to cancel. */
	identify: (signal: AbortSignal) => Promise<void | $GatewayPermit>;
	/** Positive integer deadline in milliseconds for each handshake stage. Defaults to 15000. */
	handshakeTimeoutMs?: number;
	/** Nonnegative consecutive recovery limit. Defaults to 10; 0 disables recovery attempts. */
	maxReconnectAttempts?: number;
	/** Maximum inbound frame size in bytes. Defaults to 8388608. */
	maxFrameBytes?: number;
}
/** Synchronous callbacks invoked by a gateway shard. */
export interface $GatewayCallbacks {
	/**
	 * Handle a native dispatch in gateway order.
	 * @param payload - Decoded Discord dispatch.
	 */
	dispatch(payload: $GatewayDispatch): void;
	/** Discard state tied to the previous session when it cannot be resumed or the shard stops. */
	reset(): void;
	/**
	 * Report a gateway failure.
	 * @param error - Failure cause.
	 * @param fatal - True when the shard has stopped permanently.
	 */
	failure(error: Error, fatal: boolean): void;
	/** Observe each lifecycle state change synchronously, when supplied. */
	state?(state: $GatewayState): void;
}

/** Owns exactly one shard's socket, ordered dispatches, session and timers. */
export class GatewayShard {
	/** Latency of the last acknowledged heartbeat in this connection. */
	public get ping(): number | null {
		return this.heartbeat.latency;
	}
	readonly #options: $GatewayOptions;
	private readonly clock: $Clock;
	private readonly heartbeat: Heartbeat;
	private readonly factory: (url: string) => $GatewaySocket;
	private readonly timeout: number;
	private readonly maximumFailures: number;
	private readonly frameLimit: number;
	private readonly shard: [number, number];
	private socket?: $GatewaySocket;
	private handshake?: unknown;
	private reconnect?: unknown;
	private generation = 0;
	private controller?: AbortController;
	private session?: { id: string; url: string };
	private sequence: number | null = null;
	private hello = false;
	private authenticated = false;
	private stopped = false;
	private failures = 0;
	private readyAt?: number;
	private readonly closing = new Set<Promise<void>>();
	private blockedCause?: GatewayBlockedError;
	private current: $GatewayState = "idle";
	private startPromise?: Promise<void>;
	private resolveStart?: () => void;
	private rejectStart?: (error: Error) => void;

	/**
	 * Create one gateway shard without connecting.
	 * @param options - Token, shard tuple, transport, and recovery settings.
	 * @param callbacks - Synchronous dispatch and lifecycle callbacks.
	 * @throws If the URL, intents, shard tuple, or numeric limits are invalid.
	 */
	public constructor(
		options: $GatewayOptions,
		private readonly callbacks: $GatewayCallbacks,
	) {
		this.#options = { ...options };
		integer(options.intents, "intents");
		this.shard = [...(options.shard ?? [0, 1])];
		integer(this.shard[0], "shard id");
		integer(this.shard[1], "shard count", 1);
		if (this.shard[0] >= this.shard[1])
			throw new RangeError("Shard ID must be below shard count.");
		gatewayURL(options.url);
		this.clock = options.clock ?? systemClock;
		this.factory = options.socket ?? ((url) => new WebSocket(url));
		this.timeout = integer(
			options.handshakeTimeoutMs ?? 15_000,
			"handshakeTimeoutMs",
			1,
		);
		this.maximumFailures = integer(
			options.maxReconnectAttempts ?? 10,
			"maxReconnectAttempts",
		);
		this.frameLimit = integer(
			options.maxFrameBytes ?? 8 * 1024 * 1024,
			"maxFrameBytes",
			1,
		);
		this.heartbeat = new Heartbeat(
			this.clock,
			() => this.send({ op: Op.Heartbeat, d: this.sequence }),
			() => this.retry(new Error("Gateway heartbeat was not acknowledged.")),
		);
	}
	/** Current gateway lifecycle state. */
	public get state(): $GatewayState {
		return this.current;
	}
	/** Stable terminal cause until explicit replacement of this Gateway object. */
	public get blocked(): GatewayBlockedError | undefined {
		return this.blockedCause;
	}
	/** Explicitly block a known-invalid configuration; ordinary reconnect does not clear it. */
	public block(error: GatewayBlockedError): void {
		if (!this.stopped) this.fail(error);
	}
	/** Actual socket closure barrier. No timeout is converted into proof of closure. */
	public async waitForClose(): Promise<void> {
		await Promise.all(this.closing);
	}
	/**
	 * Connect once and recover temporary failures within the configured retry limit.
	 * @returns The shared startup promise, resolved at READY or RESUMED.
	 * @throws If already stopped or a fatal connection failure occurs.
	 */
	public start(): Promise<void> {
		if (this.stopped) return Promise.reject(new Error("Gateway is closed."));
		if (this.startPromise) return this.startPromise;
		this.startPromise = new Promise<void>((resolve, reject) => {
			this.resolveStart = resolve;
			this.rejectStart = reject;
		});
		this.connect();
		return this.startPromise;
	}
	private stateChanged(state: $GatewayState): void {
		this.current = state;
		this.callbacks.state?.(state);
	}
	private connect(): void {
		if (this.stopped) return;
		if (this.closing.size >= 32) {
			this.fail(
				new GatewayBlockedError(
					"Too many Gateway sockets have unconfirmed closure.",
					"GATEWAY_CLOSE_UNKNOWN",
				),
			);
			return;
		}
		const generation = ++this.generation;
		this.controller = new AbortController();
		this.hello = false;
		this.authenticated = false;
		this.stateChanged("connecting");
		if (this.stopped || generation !== this.generation) return;
		try {
			const socket = this.factory(
				gatewayURL(this.session?.url ?? this.#options.url),
			);
			this.socket = socket;
			socket.binaryType = "arraybuffer";
			socket.onmessage = (event) => {
				if (this.stopped || generation !== this.generation) return;
				try {
					this.receive(event.data, generation);
				} catch (error) {
					this.retry(errorOf(error));
				}
			};
			socket.onerror = () => {
				if (generation === this.generation && !this.stopped)
					this.retry(new Error("Gateway transport failed."));
			};
			socket.onclose = (event) => {
				if (generation !== this.generation || this.stopped) return;
				if ([4004, 4010, 4011, 4012, 4013, 4014].includes(event.code)) {
					this.fail(
						new GatewayBlockedError(
							`Gateway closed with terminal code ${event.code}`,
							`GATEWAY_${event.code}`,
						),
					);
					return;
				}
				if ([1000, 1001, 4003, 4007, 4009].includes(event.code))
					this.resetSession();
				this.retry(new Error(`Gateway disconnected with code ${event.code}`));
			};
			this.armTimeout();
		} catch (error) {
			this.retry(errorOf(error));
		}
	}
	private receive(data: unknown, generation: number): void {
		const packet = decodeFrame(data, this.frameLimit);
		if (packet.op === Op.Reconnect) {
			this.retry(new Error("Gateway requested reconnect."), 0);
			return;
		}
		if (packet.op === Op.Hello) {
			if (this.hello) throw new Error("Received duplicate HELLO.");
			this.hello = true;
			this.clearHandshake();
			this.heartbeat.start(packet.d.heartbeat_interval);
			void this.authenticate(generation);
			return;
		}
		if (!this.hello) throw new Error("Received gateway data before HELLO.");
		switch (packet.op) {
			case Op.Heartbeat:
				this.heartbeat.request();
				return;
			case Op.HeartbeatAck:
				this.heartbeat.acknowledge();
				return;
			case Op.InvalidSession:
				if (!packet.d) this.resetSession();
				this.retry(
					new Error("Gateway invalidated session."),
					1000 + this.clock.random() * 4000,
				);
				return;
			case Op.Dispatch: {
				if (!this.authenticated)
					throw new Error("Received dispatch before Identify or Resume.");
				if (!this.session && packet.t !== E.Ready)
					throw new Error("Received dispatch before READY.");
				if (this.sequence !== null && packet.s <= this.sequence) return;
				if (packet.t === E.Ready) {
					this.session = {
						id: packet.d.session_id,
						url: gatewayURL(packet.d.resume_gateway_url),
					};
				}
				if (packet.t === E.Resumed && !this.session)
					throw new Error("RESUMED without a session.");
				try {
					this.callbacks.dispatch(packet);
				} catch (error) {
					this.fail(errorOf(error));
					return;
				}
				if (this.stopped || generation !== this.generation) return;
				this.sequence = packet.s;
				if (packet.t === E.Ready || packet.t === E.Resumed) {
					this.clearHandshake();
					this.readyAt = this.clock.now();
					this.stateChanged("ready");
					this.resolveStart?.();
					this.resolveStart = undefined;
					this.rejectStart = undefined;
				}
			}
		}
	}
	private async authenticate(generation: number): Promise<void> {
		const signal = this.controller?.signal;
		if (!signal) return;
		try {
			if (this.session && this.sequence !== null) {
				this.stateChanged("resuming");
				this.authenticated = this.send({
					op: Op.Resume,
					d: {
						token: this.#options.token,
						session_id: this.session.id,
						seq: this.sequence,
					},
				});
			} else {
				this.stateChanged("waiting_admission");
				const permit = await this.#options.identify(signal);
				if (this.stopped || generation !== this.generation || signal.aborted)
					return;
				this.callbacks.reset();
				if (this.stopped || generation !== this.generation) return;
				this.stateChanged("identifying");
				const write = () =>
					this.send({
						op: Op.Identify,
						d: {
							token: this.#options.token,
							intents: this.#options.intents,
							shard: this.shard,
							presence: this.#options.presence,
							properties: {
								os: process.platform,
								browser: "virello-engine",
								device: "virello-engine",
							},
						},
					});
				this.authenticated = permit ? permit.consume(write) : write();
			}
			if (!this.stopped && generation === this.generation) this.armTimeout();
		} catch (error) {
			if (!signal.aborted && generation === this.generation)
				this.retry(errorOf(error));
		}
	}
	private send(payload: GatewaySendPayload): boolean {
		try {
			if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
				throw new Error("Gateway socket is not open.");
			const text = JSON.stringify(payload);
			if (new TextEncoder().encode(text).byteLength > 4096)
				throw new Error("Outbound gateway payload exceeds 4096 bytes.");
			this.socket.send(text);
			return true;
		} catch (error) {
			this.retry(errorOf(error));
			return false;
		}
	}
	private armTimeout(): void {
		this.clearHandshake();
		this.handshake = this.clock.setTimeout(
			() => this.retry(new Error("Gateway handshake timed out.")),
			this.timeout,
		);
	}
	private clearHandshake(): void {
		if (this.handshake !== undefined) this.clock.clearTimeout(this.handshake);
		this.handshake = undefined;
	}
	private resetSession(): void {
		this.session = undefined;
		this.sequence = null;
		this.callbacks.reset();
	}
	private detach(code: number): void {
		++this.generation;
		this.controller?.abort(new Error("Gateway connection replaced."));
		this.controller = undefined;
		this.clearHandshake();
		this.heartbeat.stop();
		const socket = this.socket;
		this.socket = undefined;
		if (socket) {
			socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
			let resolve!: () => void;
			const closed = new Promise<void>((done) => {
				resolve = done;
			});
			this.closing.add(closed);
			socket.onclose = () => {
				this.closing.delete(closed);
				socket.onclose = null;
				resolve();
			};
			if (socket.readyState === WebSocket.CLOSED) {
				this.closing.delete(closed);
				socket.onclose = null;
				resolve();
			}
			try {
				socket.close(code);
			} catch {
				/* Closing an already failed transport is best effort. */
			}
		}
	}
	private retry(error: Error, wait?: number): void {
		if (this.stopped) return;
		if (this.reconnect !== undefined) return;
		if (this.readyAt !== undefined && this.clock.now() - this.readyAt >= 60000)
			this.failures = 0;
		this.readyAt = undefined;
		if (this.failures++ >= this.maximumFailures) {
			this.fail(error);
			return;
		}
		this.detach(4000);
		this.stateChanged("reconnecting");
		this.callbacks.failure(error, false);
		if (this.stopped) return;
		const backoff =
			wait ??
			Math.min(30_000, 500 * 2 ** Math.min(this.failures - 1, 8)) *
				(0.5 + this.clock.random());
		this.reconnect = this.clock.setTimeout(() => {
			this.reconnect = undefined;
			this.connect();
		}, backoff);
	}
	private fail(error: Error): void {
		const cause =
			error instanceof GatewayBlockedError
				? error
				: new GatewayBlockedError(error.message, "GATEWAY_RETRY_CIRCUIT", {
						cause: error,
					});
		this.blockedCause = cause;
		this.stop(cause);
		this.stateChanged("blocked");
		this.callbacks.failure(cause, true);
	}
	/**
	 * Permanently stop the shard, cancel timers, abort identification, and reset its session. Repeated calls do nothing.
	 * @param reason - Error used to reject unfinished startup; defaults to a gateway-closed error.
	 */
	public stop(reason = new Error("Gateway closed.")): void {
		if (this.stopped) return;
		this.stopped = true;
		if (this.reconnect !== undefined) this.clock.clearTimeout(this.reconnect);
		this.reconnect = undefined;
		this.detach(1000);
		this.resetSession();
		this.stateChanged("closed");
		this.rejectStart?.(reason);
		this.resolveStart = this.rejectStart = undefined;
	}
}
