import type {
	APIChannel,
	APIGuildMember,
	APIMessage,
} from "discord-api-types/v10";
import { GatewayDispatchEvents as E } from "discord-api-types/v10";
import { fallbackLogger } from "@virello/logging/console";
import { writeEvent } from "@virello/logging/diagnostics";
import { EngineCache } from "@virello/cache";
import { systemClock } from "@virello/util/runtime";
import type {
	$GatewayState,
	$GatewayCommand,
	$GatewaySendOptions,
} from "@virello/ws";
import { GatewayShard, GatewayBlockedError } from "@virello/ws";
import { IdentifyGate } from "@virello/ws/identify";
import type { $GatewayDispatch } from "@virello/ws/types";
import { RestClient } from "@virello/rest";
import { EngineInteraction } from "./EngineInteraction";
import { EngineMessage } from "./EngineMessage";
import { EventHub } from "./EventHub";
import type { $EngineEvents, $EngineFailure, $EngineOptions } from "./types";

/** Independent Bun engine. Construction opens no network connection. */
export class EngineClient {
	/** Resident native entity cache, updated before public dispatch handlers run. */
	public readonly cache: EngineCache;
	/** REST client owned by this engine and closed with it. */
	public readonly rest: RestClient;
	private readonly events: EventHub<$EngineEvents>;
	private gateway?: GatewayShard;
	private closing: Promise<void> = Promise.resolve();
	private connection?: Promise<void>;
	private connecting?: AbortController;
	private generation = 0;
	private closed = false;
	private revision = 0;
	private reporting = false;
	private startupFailure?: GatewayBlockedError;
	readonly #options: $EngineOptions;

	/**
	 * Create caches, REST transport, and the event hub without opening network connections.
	 * @param options - Bot token, intents, cache, and transport settings.
	 * @throws If token or queue/cache settings are invalid.
	 */
	public constructor(options: $EngineOptions, cache?: EngineCache) {
		this.#options = {
			...options,
			gateway: { ...options.gateway },
			rest: { ...options.rest },
		};
		this.cache = cache ?? new EngineCache(options.cache);
		this.rest = new RestClient(options.token, {
			clock: options.clock,
			...options.rest,
		});
		this.events = new EventHub(
			options.maxPendingHandlers ?? 1024,
			(error, fatal) => {
				this.report({ source: "handler", error, fatal });
				if (fatal) this.close();
			},
		);
	}
	/** Gateway lifecycle state, or idle before connect and closed after close. */
	public get state(): $GatewayState {
		return this.closed
			? "closed"
			: (this.gateway?.state ?? (this.startupFailure ? "blocked" : "idle"));
	}
	/** Machine-readable terminal Gateway cause, independent of process liveness. */
	public get gatewayFailure(): GatewayBlockedError | undefined {
		return this.gateway?.blocked ?? this.startupFailure;
	}
	/** Number of unfinished asynchronous event handlers. */
	public get pendingHandlers(): number {
		return this.events.pendingCount;
	}
	/** Last acknowledged heartbeat latency in milliseconds, or null before an acknowledgement. */
	public get ping(): number | null {
		return this.gateway?.ping ?? null;
	}
	/** Number of outbound application commands waiting for a Gateway rate-limit slot. */
	public get pendingGatewaySends(): number {
		return this.gateway?.pendingSends ?? 0;
	}
	/**
	 * Send an application command through the owning ready shard's bounded Gateway queue.
	 * Guild IDs must route to this engine's shard; use fleet messaging to reach another worker.
	 * Resolves on local write only. Responses arrive through dispatch events; failed commands are never replayed.
	 */
	public sendGateway(
		payload: $GatewayCommand,
		options?: $GatewaySendOptions,
	): Promise<void> {
		if (this.closed || !this.gateway)
			return Promise.reject(new Error("Engine Gateway is not ready."));
		return this.gateway.send(payload, options);
	}
	/** Stop the current session and clear its cache, retaining REST and event subscriptions for reassignment. */
	public reassign(shard: readonly [number, number] | null): void {
		if (this.closed) throw new Error("Engine client is closed.");
		++this.generation;
		this.startupFailure = undefined;
		++this.revision;
		this.connecting?.abort(new Error("Gateway assignment changed."));
		this.gateway?.stop();
		if (this.gateway)
			this.closing = Promise.all([
				this.closing,
				this.gateway.waitForClose(),
			]).then(() => {});
		this.gateway = undefined;
		this.connection = undefined;
		this.cache.clear();
		this.#options.gateway = {
			...this.#options.gateway,
			shard: shard ?? undefined,
		};
		this.events.emit("gatewayState", "idle");
	}
	/** Await closure of every retired Gateway socket; a missing close event leaves release unresolved. */
	public waitForGatewayClose(): Promise<void> {
		return this.closing;
	}
	/**
	 * Listen to an engine event. Handlers start synchronously in registration order; async results are tracked.
	 * @param name - Event name.
	 * @param listener - Event callback. Failures go to onError.
	 * @returns A function that removes the listener.
	 */
	public on<K extends keyof $EngineEvents>(
		name: K,
		listener: (event: $EngineEvents[K]) => void | Promise<void>,
	): () => void {
		return this.events.on(name, listener);
	}
	/**
	 * Discover fresh gateway metadata and connect one gateway shard once.
	 * @returns The shared promise, resolved when the gateway is ready.
	 * @throws For closure, metadata/gateway failures, or missing shard configuration when Discord recommends multiple shards.
	 * Failed Gateway startup blocks the Gateway while preserving REST and event subscriptions for inspection.
	 */
	public connect(): Promise<void> {
		if (this.closed)
			return Promise.reject(new Error("Engine client is closed."));
		if (!this.connection) {
			const generation = this.generation;
			this.connecting = new AbortController();
			this.connection = this.open(this.connecting.signal).catch(
				(error: unknown) => {
					if (generation !== this.generation) throw error;
					const failure =
						error instanceof GatewayBlockedError
							? error
							: new GatewayBlockedError(
									error instanceof Error
										? error.message
										: "Gateway startup failed.",
									"GATEWAY_STARTUP",
									{ cause: error },
								);
					this.startupFailure = failure;
					if (!(error instanceof GatewayBlockedError))
						this.report({ source: "gateway", error: failure, fatal: true });
					this.events.emit("gatewayState", "blocked");
					throw failure;
				},
			);
		}
		return this.connection;
	}
	/** Open the bot-wide credential circuit without destroying the engine. */
	public blockGateway(code: string): void {
		this.gateway?.block(
			new GatewayBlockedError(
				"Gateway blocked by fleet credential circuit.",
				code,
			),
		);
	}
	private async open(signal: AbortSignal): Promise<void> {
		const info = await this.rest.getGatewayBot(signal);
		signal.throwIfAborted();
		if (this.closed)
			throw new Error("Engine client closed while discovering gateway.");
		const clock = this.#options.clock ?? systemClock;
		const gate = new IdentifyGate(clock, info.session_start_limit);
		if (info.shards > 1 && !this.#options.gateway?.shard)
			throw new Error(
				"Discord recommends multiple shards. Supply a shard tuple and coordinated identify permits.",
			);
		const shardId = this.#options.gateway?.shard?.[0] ?? 0;
		this.gateway = new GatewayShard(
			{
				...this.#options.gateway,
				token: this.#options.token,
				intents: this.#options.intents,
				url: this.#options.gateway?.url ?? info.url,
				clock,
				identify: async (signal) => {
					const permit = await this.#options.waitForIdentify?.(shardId, signal);
					if (permit) return permit;
					await gate.acquire(signal);
				},
			},
			{
				dispatch: (payload) => this.dispatch(payload),
				reset: () => {
					++this.revision;
					this.cache.clear();
				},
				state: (state) => this.events.emit("gatewayState", state),
				failure: (error, fatal) => {
					this.report({ source: "gateway", error, fatal });
				},
			},
		);
		await this.gateway.start();
	}
	private dispatch(payload: $GatewayDispatch): void {
		if (this.closed) return;
		++this.revision;
		const deletions = this.cache.apply(payload);
		for (const deletion of deletions) this.events.emit("cacheDelete", deletion);
		switch (payload.t) {
			case E.Ready:
				this.events.emit("ready", payload.d);
				break;
			case E.Resumed:
				this.events.emit("resumed", payload.d);
				break;
			case E.MessageCreate: {
				const entry = this.cache.messages.peek(
					payload.d.channel_id,
					payload.d.id,
				);
				const message = entry?.complete ? entry.data : payload.d;
				this.events.emit(
					"messageCreate",
					new EngineMessage(message, this.rest),
				);
				break;
			}
			case E.MessageUpdate:
				this.events.emit("messageUpdate", {
					payload: payload.d,
					cached: this.cache.messages.peek(payload.d.channel_id, payload.d.id),
				});
				break;
			case E.InteractionCreate:
				this.events.emit(
					"interactionCreate",
					new EngineInteraction(payload.d, this.rest),
				);
				break;
		}
		this.events.emit("dispatch", payload);
	}
	/**
	 * Fetch a full member over HTTP and cache it only if no gateway dispatch occurred during the read.
	 * @param guildId - Guild ID.
	 * @param userId - Member’s user ID.
	 * @returns Full native member data; REST failures reject.
	 */
	public async fetchMember(
		guildId: string,
		userId: string,
	): Promise<APIGuildMember> {
		const version = this.revision;
		const member = await this.rest.getMember(guildId, userId);
		if (!this.closed && version === this.revision) {
			this.cache.putMember(guildId, userId, member);
			const cached = this.cache.members.peek(guildId, userId);
			if (cached?.complete) return cached.data;
		}
		return member;
	}
	/**
	 * Fetch a full channel over HTTP, avoiding stale cache writes after concurrent dispatches.
	 * @param channelId - Channel ID.
	 * @returns Full native channel data; REST failures reject.
	 */
	public async fetchChannel(channelId: string): Promise<APIChannel> {
		const version = this.revision;
		const channel = await this.rest.getChannel(channelId);
		if (!this.closed && version === this.revision) {
			this.cache.putChannel(channel);
			const cached = this.cache.channels.peek(channelId);
			if (cached?.complete) return cached.data;
		}
		return channel;
	}
	/**
	 * Fetch a full message over HTTP, avoiding stale cache writes after concurrent dispatches.
	 * @param channelId - Channel ID.
	 * @param messageId - Message ID.
	 * @returns Full native message data; REST failures reject.
	 */
	public async fetchMessage(
		channelId: string,
		messageId: string,
	): Promise<APIMessage> {
		const version = this.revision;
		const message = await this.rest.getMessage(channelId, messageId);
		if (!this.closed && version === this.revision) {
			this.cache.putMessage(message);
			const cached = this.cache.messages.peek(channelId, messageId);
			if (cached?.complete) return cached.data;
		}
		return message;
	}
	/** Wait until all currently tracked asynchronous event handlers settle. Handler errors are reported through onError. */
	public idle(): Promise<void> {
		return this.events.idle();
	}
	/**
	 * Permanently stop the gateway, abort REST work, clear caches, and stop accepting event work. Running handlers are not
	 * cancelled; await idle() to let them finish.
	 */
	public close(): void {
		if (this.closed) return;
		this.closed = true;
		++this.generation;
		this.connecting?.abort(new Error("Engine client closed."));
		++this.revision;
		this.gateway?.stop();
		this.rest.close();
		this.cache.clear();
		this.events.close();
	}
	private report(failure: $EngineFailure): void {
		if (this.reporting) return;
		this.reporting = true;
		try {
			if (this.#options.onError) this.#options.onError(failure);
			else
				writeEvent(fallbackLogger(), "error", {
					component: `engine.${failure.source}`,
					event: "operation_failed",
					message:
						failure.source === "gateway"
							? failure.fatal
								? "Gateway session cannot continue; the engine connection is closing."
								: "Gateway connection interrupted; inspect transport diagnostics while recovery proceeds."
							: failure.source === "handler"
								? failure.fatal
									? "Pending event handlers exceeded capacity; closing the engine to bound unfinished work."
									: "An event handler failed; other handlers can continue. Inspect the failing callback."
								: "Engine client operation failed; inspect its lifecycle state and diagnostic cause.",
					error: failure.error,
					context: {
						fatal: failure.fatal,
						shard: this.#options.gateway?.shard?.[0] ?? 0,
						state: this.state,
						pendingHandlers: this.pendingHandlers,
					},
				});
		} catch (error) {
			writeEvent(fallbackLogger(), "error", {
				component: "engine.client",
				event: "error_callback_failed",
				message:
					"Engine onError callback threw while reporting a failure; inspect the callback itself.",
				error,
			});
		} finally {
			this.reporting = false;
		}
	}
}
