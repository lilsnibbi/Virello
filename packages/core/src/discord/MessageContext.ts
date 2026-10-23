import {
	Routes,
	type APIMessage,
	type GatewayMessageCreateDispatchData,
	type ComponentType,
} from "discord-api-types/v10";
import type { VirelloClient } from "../core/client/VirelloClient";
import {
	InteractionCollector,
	ReactionCollector,
	type ComponentInteractionFor,
	type InteractionCollectorOptions,
	type CollectorOptions,
	type Reaction,
} from "./Collector";
import type { APIUser } from "discord-api-types/v10";
import {
	messagePayload,
	type MessageBody,
	type MessageEditBody,
} from "./payloads";
import { permissionsFor } from "./permissions";

/** A message invocation and its native Discord payload. Cached entities remain explicit and may be partial. */
export class MessageContext<InGuild extends boolean = boolean> {
	constructor(
		readonly client: VirelloClient,
		readonly data: APIMessage &
			Partial<Pick<GatewayMessageCreateDispatchData, "guild_id" | "member">>,
	) {}
	get id(): string {
		return this.data.id;
	}
	get channelId(): string {
		return this.data.channel_id;
	}
	get guildId(): InGuild extends true ? string : string | null {
		return (this.data.guild_id ??
			this.client.cache.guildForChannel(this.channelId) ??
			null) as InGuild extends true ? string : string | null;
	}
	get author() {
		return this.data.author;
	}
	get content(): string {
		return this.data.content;
	}
	get webhookId(): string | null {
		return this.data.webhook_id ?? null;
	}
	get createdTimestamp(): number {
		return Date.parse(this.data.timestamp);
	}
	get embeds() {
		return this.data.embeds;
	}
	/** Thread started by this message, when included in its native payload. */
	get thread() {
		return this.data.thread;
	}
	get attachments() {
		return this.data.attachments;
	}
	get channel() {
		const entry = this.client.cache.channels.get(this.channelId);
		return entry?.complete ? entry.data : null;
	}
	get guild() {
		return this.guildId
			? {
					...this.client.cache.guilds.get(this.guildId)?.data,
					id: this.guildId,
				}
			: null;
	}
	get member() {
		return (
			this.data.member ??
			(this.guildId
				? this.client.cache.members.get(this.guildId, this.author.id)?.data
				: undefined) ??
			null
		);
	}
	get editable(): boolean {
		return this.author.id === this.client.user?.id;
	}
	inGuild(): this is this & MessageContext<true> {
		return this.guildId !== null;
	}
	async reply(input: string | MessageBody): Promise<MessageContext> {
		const { body, files } = messagePayload(input);
		return new MessageContext(
			this.client,
			await this.client.rest.request<APIMessage>({
				method: "POST",
				path: Routes.channelMessages(this.channelId),
				files,
				body: {
					...body,
					message_reference: {
						message_id: this.id,
						channel_id: this.channelId,
						...(body.message_reference as object | undefined),
					},
				},
			}),
		);
	}
	async edit(input: string | MessageEditBody): Promise<MessageContext> {
		return new MessageContext(
			this.client,
			await this.client.rest.request<APIMessage>({
				method: "PATCH",
				path: Routes.channelMessage(this.channelId, this.id),
				...messagePayload(input),
			}),
		);
	}
	async delete(): Promise<void> {
		await this.client.rest.request({
			method: "DELETE",
			path: Routes.channelMessage(this.channelId, this.id),
		});
	}
	async react(emoji: string): Promise<void> {
		const custom = /^<a?:([^:]+):(\d+)>$/.exec(emoji);
		const identifier = custom ? `${custom[1]}:${custom[2]}` : emoji;
		await this.client.rest.request({
			method: "PUT",
			path: Routes.channelMessageOwnReaction(
				this.channelId,
				this.id,
				encodeURIComponent(identifier),
			),
		});
	}
	permissionsFor(userId: string) {
		return permissionsFor(this.client, this.guildId, this.channelId, userId);
	}
	createMessageComponentCollector<C extends ComponentType>(
		options: InteractionCollectorOptions<ComponentInteractionFor<C>> & {
			componentType: C;
		},
	): InteractionCollector<ComponentInteractionFor<C>> {
		return new InteractionCollector(this.client, {
			channel: this.channelId,
			guild: this.guildId ?? undefined,
			...options,
			message: this.id,
		});
	}
	createReactionCollector(
		options: CollectorOptions<[Reaction, APIUser]> = {},
	): ReactionCollector {
		return new ReactionCollector(this, options);
	}
}
