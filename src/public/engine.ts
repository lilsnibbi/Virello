/**
 * Native Discord gateway, REST, cache, message, and interaction APIs, with shared logging helpers.
 * @packageDocumentation
 */
import "../core/runtime";

export { createConsoleLogger } from "../core/logging/console";
export { writeEvent as logEvent } from "../core/logging/diagnostics";
export type {
	ConsoleLogOptions,
	LogEntry as ConsoleLogEntry,
} from "../core/logging/format";
export type { LoggerLike } from "../core/logging/LoggerLike";

export { CacheStore } from "../engine/cache/CacheStore";
export { EngineCache } from "../engine/cache/EngineCache";
export { ScopedCache } from "../engine/cache/ScopedCache";
export type {
	$CacheDecision,
	$CacheDeletion,
	$CacheEntities,
	$CacheEntry,
	$CacheKind,
	$CacheOptions,
	$CachePolicy,
	$Patch,
} from "../engine/cache/types";
export { EngineClient } from "../engine/client/EngineClient";
export {
	type $InteractionReplyState,
	EngineInteraction,
} from "../engine/client/EngineInteraction";
export { EngineMessage } from "../engine/client/EngineMessage";
export type {
	$EngineEvents,
	$EngineFailure,
	$EngineOptions,
} from "../engine/client/types";
export type { $Clock } from "../engine/common";
export {
	type $GatewayCallbacks,
	type $GatewayOptions,
	type $GatewaySocket,
	type $GatewayState,
	GatewayShard,
} from "../engine/gateway/GatewayShard";
export type {
	$GatewayDispatch,
	$GatewayPacket,
	$MessageUpdateData,
} from "../engine/gateway/types";
export {
	type $Fetch,
	type $RestOptions,
	type $RestRequest,
	RestClient,
} from "../engine/rest/RestClient";
export { RestError } from "../engine/rest/RestError";
