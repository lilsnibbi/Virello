import { EventEmitter } from "node:events";
import {
	GatewayIntentBits,
	Routes,
	type APIUser,
	type APIMessage,
	type GatewayPresenceUpdateData,
} from "discord-api-types/v10";
import { EngineClient } from "../../engine/client/EngineClient";
import { EngineCache } from "../../engine/cache/EngineCache";
import type { $EngineOptions } from "../../engine/client/types";
import type { ClientEvents } from "../../events/events";
import { MessageContext } from "../../discord/MessageContext";
import { InteractionContext } from "../../discord/InteractionContext";
import { ApplicationCommands } from "../../discord/ApplicationCommands";
import { gatewayEventName } from "../../discord/events";
import { messagePayload, type MessageBody } from "../../discord/payloads";
import { fallbackLogger } from "../logging/console";
import type { VirelloClient, VirelloClientOptions } from "./VirelloClient";

export interface DiscordRuntimeOptions extends Omit<
	$EngineOptions,
	"token" | "intents"
> {
	intents: number | readonly (keyof typeof GatewayIntentBits | number)[];
	/** Native presence included with a fresh IDENTIFY. */
	presence?: GatewayPresenceUpdateData;
}
export function resolveIntents(
	value: DiscordRuntimeOptions["intents"],
): number {
	const flags =
		typeof value === "number"
			? [value]
			: value.map((item) =>
					typeof item === "number"
						? item
						: Object.hasOwn(GatewayIntentBits, item)
							? GatewayIntentBits[item]
							: NaN,
				);
	if (flags.some((flag) => !Number.isSafeInteger(flag) || flag < 0))
		throw new TypeError("intents must contain valid gateway intent flags.");
	const mask = Number(flags.reduce((bits, flag) => bits | BigInt(flag), 0n));
	if (!Number.isSafeInteger(mask))
		throw new TypeError("intents exceed a safe integer mask.");
	return mask;
}

/** Internal lifecycle bridge to the single native engine owned by VirelloClient. */
export abstract class DiscordRuntime extends EventEmitter<ClientEvents> {
	readonly cache: EngineCache;
	readonly options: VirelloClientOptions;
	user: APIUser | null = null;
	application: { id: string; commands: ApplicationCommands } | null = null;
	readyTimestamp: number | null = null;
	private native?: EngineClient;
	#credential?: string;
	constructor(options: VirelloClientOptions) {
		super({ captureRejections: true });
		resolveIntents(options.intents);
		this.options = { ...options, gateway: { ...options.gateway } };
		this.cache = new EngineCache(options.cache);
		this.on("error", (error) =>
			(options.logger ?? fallbackLogger()).error(error),
		);
	}
	get engine(): EngineClient {
		if (!this.native)
			throw new Error("The native engine is available after login begins.");
		return this.native;
	}
	get rest() {
		return this.engine.rest;
	}
	get uptime(): number | null {
		return this.readyTimestamp === null
			? null
			: Date.now() - this.readyTimestamp;
	}
	get ping(): number | null {
		return this.native?.ping ?? null;
	}
	isReady(): boolean {
		return this.native?.state === "ready" && this.user !== null;
	}
	/** Start or resume the assigned native gateway; framework hooks are owned by VirelloClient.login. */
	async openGateway(token?: string): Promise<string> {
		if (!this.native) {
			const value = token?.replace(/^(Bot|Bearer)\s+/i, "").trim();
			if (!value)
				throw new TypeError("Pass your bot token to client.login(token).");
			this.#credential = value;
			const client = this as unknown as VirelloClient;
			const engine = (this.native = new EngineClient(
				{
					...this.options,
					token: value,
					intents: resolveIntents(this.options.intents),
					gateway: {
						...this.options.gateway,
						presence: this.options.presence ?? this.options.gateway?.presence,
					},
					onError: (failure) => {
						try {
							this.options.onError?.(failure);
							this.emit("error", failure.error);
						} finally {
							if (failure.fatal)
								void client
									.destroy()
									.catch((error: unknown) => fallbackLogger().error(error));
						}
					},
				},
				this.cache,
			));
			let freshReady = false;
			engine.on("ready", (data) => {
				this.user = data.user;
				this.application = {
					id: data.application.id,
					commands: new ApplicationCommands(engine.rest, data.application.id),
				};
				this.readyTimestamp = Date.now();
				freshReady = true;
			});
			engine.on("messageCreate", (message) => {
				this.emit("messageCreate", new MessageContext(client, message.data));
			});
			engine.on("interactionCreate", (interaction) => {
				this.emit(
					"interactionCreate",
					new InteractionContext(client, interaction),
				);
			});
			engine.on("messageUpdate", (update) => {
				this.emit("messageUpdate", update);
			});
			engine.on("cacheDelete", (deletion) => {
				this.emit("cacheDelete", deletion);
			});
			engine.on("gatewayState", (state) => {
				this.emit("gatewayState", state);
				if (state === "ready" && freshReady) {
					freshReady = false;
					this.emit("shardReady", this.options.gateway?.shard?.[0] ?? 0);
					this.emit("clientReady", client);
				}
			});
			engine.on("dispatch", (payload) => {
				const name: string = gatewayEventName(payload.t);
				if (
					!["MESSAGE_CREATE", "MESSAGE_UPDATE", "INTERACTION_CREATE"].includes(
						payload.t,
					)
				)
					this.emit(name, payload.d);
				this.emit("raw", payload);
			});
		}
		await this.native.connect();
		return this.#credential!;
	}
	/** Retire the old session immediately, preserving REST, modules and listeners. */
	reassignGateway(shard: readonly [number, number] | null): void {
		this.options.gateway = {
			...this.options.gateway,
			shard: shard ?? undefined,
		};
		this.readyTimestamp = null;
		if (this.native && this.native.state !== "closed")
			this.native.reassign(shard);
	}
	async login(token?: string): Promise<string> {
		return this.openGateway(token);
	}
	async fetchUser(id: string): Promise<APIUser> {
		return this.rest.request({ method: "GET", path: Routes.user(id) });
	}
	async send(
		channelId: string,
		input: string | MessageBody,
	): Promise<MessageContext> {
		return new MessageContext(
			this as unknown as VirelloClient,
			await this.rest.request<APIMessage>({
				method: "POST",
				path: Routes.channelMessages(channelId),
				...messagePayload(input),
			}),
		);
	}
	async sendTyping(channelId: string): Promise<void> {
		await this.rest.request({
			method: "POST",
			path: Routes.channelTyping(channelId),
		});
	}
	async destroy(): Promise<void> {
		this.emit("shutdown");
		this.native?.close();
		this.readyTimestamp = null;
		this.#credential = undefined;
		this.cache.clear();
		this.removeAllListeners();
	}
}
