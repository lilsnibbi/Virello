/**
 * Native Discord gateway, REST, cache, message, and interaction APIs, with shared logging helpers.
 * @packageDocumentation
 */
import "@virello/util/bun";

export { createConsoleLogger } from "@virello/logging/console";
export { writeEvent as logEvent } from "@virello/logging/diagnostics";
export type {
	ConsoleLogOptions,
	LogEntry as ConsoleLogEntry,
} from "@virello/logging/format";
export type { LoggerLike } from "@virello/logging/LoggerLike";

export { CacheStore } from "@virello/cache";
export { EngineCache } from "@virello/cache";
export { ScopedCache } from "@virello/cache";
export type {
	$CacheDecision,
	$CacheDeletion,
	$CacheEntities,
	$CacheEntry,
	$CacheKind,
	$CacheOptions,
	$CachePolicy,
	$Patch,
} from "@virello/cache";
export { EngineClient } from "./client/index";
export { type $InteractionReplyState, EngineInteraction } from "./client/index";
export { EngineMessage } from "./client/index";
export type {
	$EngineEvents,
	$EngineFailure,
	$EngineOptions,
} from "./client/index";
export type { $Clock } from "@virello/util/runtime";
export {
	type $GatewayCallbacks,
	type $GatewayOptions,
	type $GatewaySocket,
	type $GatewayState,
	GatewayShard,
} from "@virello/ws";
export type {
	$GatewayDispatch,
	$GatewayPacket,
	$MessageUpdateData,
} from "@virello/ws/types";
export {
	type $Fetch,
	type $RestOptions,
	type $RestRequest,
	RestClient,
} from "@virello/rest";
export { RestError } from "@virello/rest";
