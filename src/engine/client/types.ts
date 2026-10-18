import type {
	APIMessage,
	GatewayReadyDispatchData,
	GatewayResumedDispatch,
} from "discord-api-types/v10";
import type {
	$CacheDeletion,
	$CacheEntry,
	$CacheOptions,
} from "../cache/types";
import type { $Clock } from "../common";
import type { $GatewayOptions, $GatewayState } from "../gateway/GatewayShard";
import type { $GatewayDispatch, $MessageUpdateData } from "../gateway/types";
import type { $RestOptions } from "../rest/RestClient";
import type { EngineInteraction } from "./EngineInteraction";
import type { EngineMessage } from "./EngineMessage";

/** Failure reported to the engine’s synchronous error callback. */
export interface $EngineFailure {
	/** Part of the engine that reported the failure. */
	source: "gateway" | "handler" | "client";
	/** Failure cause. */
	error: Error;
	/** Whether the failure closes the engine client. */
	fatal: boolean;
}
/** Typed engine events. Gateway cache updates finish before these handlers run. */
export interface $EngineEvents {
	/** Native READY data for a fresh session. */
	ready: GatewayReadyDispatchData;
	/** Native RESUMED data after a successful session resume. */
	resumed: GatewayResumedDispatch["d"];
	/** Original native dispatch, emitted after any specialized event. */
	dispatch: $GatewayDispatch;
	/** Created message with its native data and REST reply helper. */
	messageCreate: EngineMessage;
	/** Original partial update and the resulting cache entry, if retained. */
	messageUpdate: {
		/** Original partial native update; absent fields were not supplied by Discord. */
		payload: $MessageUpdateData;
		/** Updated cache entry, or undefined when no entry was retained. Check complete before assuming full data. */
		cached: $CacheEntry<APIMessage> | undefined;
	};
	/** Native interaction with initial-response tracking. */
	interactionCreate: EngineInteraction;
	/** Deleted entity and its previous cache entry, when available. */
	cacheDelete: $CacheDeletion;
	/** New gateway lifecycle state. */
	gatewayState: $GatewayState;
}
/** Configuration for the standalone engine entry point. */
export interface $EngineOptions {
	/** Discord bot token. The engine reads no environment token automatically. */
	token: string;
	/** Nonnegative Discord gateway intent bitfield. */
	intents: number;
	/** Shared clock and timer hooks for engine timing. Defaults to native timing. */
	clock?: $Clock;
	/** Cache settings. Member caches default to 1000 per guild; messages default to disabled. */
	cache?: $CacheOptions;
	/** REST transport and queue settings; individual REST clock settings can override the shared clock. */
	rest?: $RestOptions;
	/** Optional gateway overrides. Token, intents, shared clock, and identify callbacks come from the engine. */
	gateway?: Partial<
		Omit<$GatewayOptions, "token" | "intents" | "clock" | "identify">
	>;
	/** Positive integer cap on unfinished event handlers. Defaults to 1024; exceeding it closes the engine. */
	maxPendingHandlers?: number;
	/** Synchronous failure callback. Defaults to framework console logging; callback errors are logged without escaping. */
	onError?: (failure: $EngineFailure) => void;
	/**
	 * Optional external permit awaited before each fresh IDENTIFY, followed by the local Discord session gate. Observe the
	 * abort signal when coordinating shards.
	 */
	waitForIdentify?: (shardId: number, signal: AbortSignal) => Promise<void>;
}
