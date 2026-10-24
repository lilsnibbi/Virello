/**
 * Native Discord gateway, REST, cache, message, and interaction APIs, with shared logging helpers.
 * @packageDocumentation
 */
import "@virello/util/bun";

export {
	type ConsoleLogEntry,
	type ConsoleLogOptions,
	createConsoleLogger,
	logEvent,
	type LoggerLike,
} from "@virello/logging";
export * from "@virello/cache";
export * from "./client/index";
export type { $Clock } from "@virello/util/runtime";
export {
	type $GatewayCallbacks,
	type $GatewayDispatch,
	type $GatewayOptions,
	type $GatewayPacket,
	type $GatewaySocket,
	type $GatewayState,
	type $MessageUpdateData,
	GatewayShard,
} from "@virello/ws";
export {
	type $Fetch,
	type $RestOptions,
	type $RestRequest,
	RestClient,
	RestError,
} from "@virello/rest";
