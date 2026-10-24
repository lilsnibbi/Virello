import { EventEmitter, captureRejectionSymbol } from "node:events";
import {
	ComponentType,
	type APIUser,
	type GatewayMessageReactionAddDispatchData,
} from "discord-api-types/v10";
import type { VirelloClient } from "../core/client/VirelloClient";
import type { MessageContext } from "./MessageContext";
import type {
	InteractionContext,
	MessageComponentInteraction,
	ButtonInteraction,
	StringSelectMenuInteraction,
} from "./InteractionContext";

export type CollectorFilter<A extends unknown[]> = (
	...args: A
) => boolean | Promise<boolean>;
export interface CollectorOptions<A extends unknown[]> {
	filter?: CollectorFilter<A>;
	time?: number;
	idle?: number;
	max?: number;
	/** Bound pending asynchronous filters. Defaults to 128. */
	maxPending?: number;
	/** Bound retained results. Defaults to 1000. */
	maxCollected?: number;
}

/** Event collector with ordered async filtering, bounded work and deterministic listener/timer cleanup. */
export class Collector<
	A extends [{ id: string }, ...unknown[]],
> extends EventEmitter<{
	collect: A;
	ignore: A;
	end: [Map<string, A[0]>, string];
	error: [unknown];
}> {
	readonly collected = new Map<string, A[0]>();
	ended = false;
	reason: string | null = null;
	error: unknown;
	private timer?: ReturnType<typeof setTimeout>;
	private idleTimer?: ReturnType<typeof setTimeout>;
	private queue = Promise.resolve();
	private pending = 0;
	private received = 0;
	protected readonly cleanups: (() => void)[] = [];
	constructor(
		readonly client: VirelloClient,
		readonly options: CollectorOptions<A> = {},
	) {
		super({ captureRejections: true });
		for (const name of [
			"time",
			"idle",
			"max",
			"maxPending",
			"maxCollected",
		] as const) {
			const value = options[name];
			if (
				value !== undefined &&
				(!Number.isSafeInteger(value) || value <= 0 || value > 2147483647)
			)
				throw new RangeError(
					`Collector ${name} must be a positive integer no larger than 2147483647.`,
				);
		}
		const shutdown = () => this.stop("clientDestroyed");
		client.on("shutdown", shutdown);
		this.cleanups.push(() => client.off("shutdown", shutdown));
		this.resetTimer();
	}
	protected accept(...args: A): void {
		this.acceptDeferred(() => args);
	}
	protected acceptDeferred(resolve: () => A | Promise<A>): void {
		if (this.ended) return;
		if (this.pending >= (this.options.maxPending ?? 128)) {
			this.fail(new Error("Collector pending filter capacity exceeded."));
			return;
		}
		++this.pending;
		this.queue = this.queue
			.then(async () => {
				if (this.ended) return;
				const args = await resolve();
				if (this.ended) return;
				const accepted = (await this.options.filter?.(...args)) ?? true;
				if (this.ended) return;
				if (!accepted) {
					await this.dispatch("ignore", args);
					return;
				}
				this.collected.set(args[0].id, args[0]);
				++this.received;
				this.resetIdle();
				await this.dispatch("collect", args);
				if (this.received >= (this.options.max ?? Infinity)) this.stop("limit");
				else if (this.collected.size >= (this.options.maxCollected ?? 1000))
					this.stop("capacity");
			})
			.catch((error: unknown) => this.fail(error))
			.finally(() => {
				--this.pending;
			});
	}
	private async dispatch(
		event: "collect" | "ignore" | "end",
		args: unknown[],
	): Promise<void> {
		await Promise.all(
			this.rawListeners(event).map((listener) =>
				Reflect.apply(listener, this, args),
			),
		);
	}
	override [captureRejectionSymbol](error: unknown): void {
		this.fail(error);
	}
	protected watchScope(
		channelId?: string,
		guildId?: string,
		messageId?: string,
	): void {
		const deleted = (data: { id: string }) => {
			if (data.id === messageId) this.stop("messageDelete");
		};
		const bulk = (data: { ids: string[] }) => {
			if (messageId && data.ids.includes(messageId)) this.stop("messageDelete");
		};
		const channel = (data: { id: string }) => {
			if (data.id === channelId) this.stop("channelDelete");
		};
		const thread = (data: { id: string }) => {
			if (data.id === channelId) this.stop("threadDelete");
		};
		const guild = (data: { id: string; unavailable?: boolean }) => {
			if (data.id === guildId && !data.unavailable) this.stop("guildDelete");
		};
		this.client
			.on("messageDelete", deleted)
			.on("messageDeleteBulk", bulk)
			.on("channelDelete", channel)
			.on("threadDelete", thread)
			.on("guildDelete", guild);
		this.cleanups.push(() => {
			this.client
				.off("messageDelete", deleted)
				.off("messageDeleteBulk", bulk)
				.off("channelDelete", channel)
				.off("threadDelete", thread)
				.off("guildDelete", guild);
		});
	}
	protected fail(error: unknown): void {
		this.error = error;
		this.stop("error");
		if (this.listenerCount("error")) this.emit("error", error);
		else this.client.logger.error(error);
	}
	resetTimer(options: Pick<CollectorOptions<A>, "time" | "idle"> = {}): void {
		if (this.ended) return;
		if (options.time !== undefined) this.options.time = options.time;
		if (options.idle !== undefined) this.options.idle = options.idle;
		clearTimeout(this.timer);
		if (this.options.time)
			this.timer = setTimeout(() => this.stop("time"), this.options.time);
		this.resetIdle();
	}
	private resetIdle(): void {
		clearTimeout(this.idleTimer);
		if (this.options.idle)
			this.idleTimer = setTimeout(() => this.stop("idle"), this.options.idle);
	}
	stop(reason = "user"): void {
		if (this.ended) return;
		this.ended = true;
		this.reason = reason;
		clearTimeout(this.timer);
		clearTimeout(this.idleTimer);
		for (const dispose of this.cleanups.splice(0)) dispose();
		void this.dispatch("end", [this.collected, reason]).catch(
			(error: unknown) => this.fail(error),
		);
	}
}

export type ComponentInteractionFor<C extends ComponentType> =
	C extends ComponentType.Button
		? ButtonInteraction
		: C extends ComponentType.StringSelect
			? StringSelectMenuInteraction
			: MessageComponentInteraction;
export interface InteractionCollectorOptions<
	I extends InteractionContext,
> extends CollectorOptions<[I]> {
	componentType?: ComponentType;
	interactionType?: number;
	message?: string | MessageContext;
	channel?: string | { id: string };
	guild?: string | { id: string };
}
function id(value: string | { id: string } | undefined): string | undefined {
	return typeof value === "string" ? value : value?.id;
}

export class InteractionCollector<
	I extends InteractionContext = MessageComponentInteraction,
> extends Collector<[I]> {
	constructor(
		client: VirelloClient,
		options: InteractionCollectorOptions<I> = {},
	) {
		super(client, options);
		const messageId = id(options.message),
			channelId = id(options.channel),
			guildId = id(options.guild);
		this.watchScope(channelId, guildId, messageId);
		const onInteraction = (interaction: InteractionContext) => {
			if (
				options.interactionType !== undefined &&
				interaction.type !== options.interactionType
			)
				return;
			if (
				options.componentType !== undefined &&
				(!interaction.isMessageComponent() ||
					interaction.data.data.component_type !== options.componentType)
			)
				return;
			if (messageId && interaction.message?.id !== messageId) return;
			if (channelId && interaction.channelId !== channelId) return;
			if (guildId && interaction.guildId !== guildId) return;
			this.accept(interaction as I);
		};
		client.on("interactionCreate", onInteraction);
		this.cleanups.push(() => client.off("interactionCreate", onInteraction));
	}
}

export class MessageCollector extends Collector<[MessageContext]> {
	constructor(
		client: VirelloClient,
		channelId: string,
		options: CollectorOptions<[MessageContext]> = {},
	) {
		super(client, options);
		this.watchScope(channelId, client.cache.guildForChannel(channelId));
		const listener = (message: MessageContext) => {
			if (message.channelId === channelId) this.accept(message);
		};
		client.on("messageCreate", listener);
		this.cleanups.push(() => client.off("messageCreate", listener));
	}
}

export interface Reaction {
	id: string;
	emoji: GatewayMessageReactionAddDispatchData["emoji"];
	message: MessageContext;
	data: GatewayMessageReactionAddDispatchData;
}
export class ReactionCollector extends Collector<[Reaction, APIUser]> {
	constructor(
		message: MessageContext,
		options: CollectorOptions<[Reaction, APIUser]> = {},
	) {
		super(message.client, options);
		this.watchScope(
			message.channelId,
			message.guildId ?? undefined,
			message.id,
		);
		const listener = (data: GatewayMessageReactionAddDispatchData) => {
			if (data.message_id !== message.id) return;
			this.acceptDeferred(async () => [
				{
					id: `${data.emoji.id ?? data.emoji.name}:${data.user_id}`,
					emoji: data.emoji,
					message,
					data,
				},
				data.member?.user ?? (await message.client.fetchUser(data.user_id)),
			]);
		};
		message.client.on("messageReactionAdd", listener);
		this.cleanups.push(() =>
			message.client.off("messageReactionAdd", listener),
		);
	}
}
