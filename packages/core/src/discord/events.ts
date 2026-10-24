import { GatewayDispatchEvents } from "discord-api-types/v10";
import type { $GatewayDispatch } from "@virello/ws/types";
import type { $EngineEvents } from "@virello/engine/client";
import type { VirelloClient } from "../core/client/VirelloClient";
import type { MessageContext } from "./MessageContext";
import type { InteractionContext } from "./InteractionContext";

type Camel<S extends string> = S extends `${infer First}_${infer Rest}`
	? `${Lowercase<First>}${Capitalize<Camel<Rest>>}`
	: Lowercase<S>;
export function gatewayEventName<T extends string>(name: T): Camel<T> {
	return name
		.toLowerCase()
		.replace(/_([a-z])/g, (_, letter: string) =>
			letter.toUpperCase(),
		) as Camel<T>;
}
export const GatewayEvents = Object.fromEntries(
	Object.entries(GatewayDispatchEvents).map(([key, name]) => [
		key,
		gatewayEventName(name),
	]),
) as {
	[K in keyof typeof GatewayDispatchEvents]: Camel<
		(typeof GatewayDispatchEvents)[K]
	>;
};
type DispatchEvents = { [P in $GatewayDispatch as Camel<P["t"]>]: [P["d"]] };
/** Native gateway event payloads, except message/interaction creation which supply framework contexts. */
export interface DiscordEvents extends Omit<
	DispatchEvents,
	"messageCreate" | "interactionCreate" | "messageUpdate"
> {
	clientReady: [VirelloClient];
	messageCreate: [MessageContext];
	messageUpdate: [$EngineEvents["messageUpdate"]];
	interactionCreate: [InteractionContext];
	raw: [$GatewayDispatch];
	cacheDelete: [$EngineEvents["cacheDelete"]];
	gatewayState: [$EngineEvents["gatewayState"]];
	shardReady: [number];
	shutdown: [];
	error: [unknown];
}
