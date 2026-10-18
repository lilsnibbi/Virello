import {
	ApplicationCommandType,
	ComponentType,
	InteractionResponseType,
	InteractionType,
	MessageFlags,
	Routes,
	type APIInteraction,
	type APIChatInputApplicationCommandInteraction,
	type APIApplicationCommandAutocompleteInteraction,
	type APIContextMenuInteraction,
	type APIMessageComponentInteraction,
	type APIMessageComponentButtonInteraction,
	type APIMessageComponentSelectMenuInteraction,
	type APIMessageStringSelectInteractionData,
	type APIModalSubmitInteraction,
	type APIMessage,
	type APIUser,
	type APIInteractionResponseCallbackData,
	type APIApplicationCommandOptionChoice,
	type APIModalInteractionResponseCallbackData,
	type RESTPostAPIInteractionCallbackJSONBody,
} from "discord-api-types/v10";
import type { VirelloClient } from "../core/client/VirelloClient";
import type { EngineInteraction } from "../engine/client/EngineInteraction";
import { ChatInputInteractionOptionResolver } from "../utilities/discord/constants/resolvers/ChatInputInteractionOptionResolver";
import { AutocompleteInteractionOptionResolver } from "../utilities/discord/constants/resolvers/AutocompleteInteractionOptionResolver";
import { ContextMenuInteractionOptionResolver } from "../utilities/discord/constants/resolvers/ContextMenuInteractionOptionResolver";
import { ModalInteractionOptionResolver } from "../utilities/discord/constants/resolvers/ModalInteractionOptionResolver";
import { MessageContext } from "./MessageContext";
import { Permissions } from "./permissions";
import {
	messagePayload,
	type InteractionReplyBody,
	type MessageEditBody,
	type JSONEncodable,
} from "./payloads";

type Options<T> = T extends APIChatInputApplicationCommandInteraction
	? ChatInputInteractionOptionResolver
	: T extends APIApplicationCommandAutocompleteInteraction
		? AutocompleteInteractionOptionResolver
		: T extends APIContextMenuInteraction
			? ContextMenuInteractionOptionResolver
			: never;

/** Framework interaction context. data and resolved entities use Discord's native snake_case shape. */
export class InteractionContext<T extends APIInteraction = APIInteraction> {
	readonly data: T;
	private didDefer = false;
	private responseFlags: number | undefined;
	private resolver?: Options<T>;
	constructor(
		readonly client: VirelloClient,
		private readonly interaction: EngineInteraction,
	) {
		this.data = interaction.data as T;
	}
	get id(): string {
		return this.data.id;
	}
	get type(): T["type"] {
		return this.data.type;
	}
	get applicationId(): string {
		return this.data.application_id;
	}
	get channelId(): string | null {
		return "channel_id" in this.data ? (this.data.channel_id ?? null) : null;
	}
	get guildId(): string | null {
		return "guild_id" in this.data ? (this.data.guild_id ?? null) : null;
	}
	get guild() {
		return this.guildId
			? {
					...this.client.cache.guilds.get(this.guildId)?.data,
					id: this.guildId,
				}
			: null;
	}
	get channel() {
		return "channel" in this.data ? (this.data.channel ?? null) : null;
	}
	get user(): APIUser {
		const user =
			("member" in this.data ? this.data.member?.user : undefined) ??
			("user" in this.data ? this.data.user : undefined);
		if (!user) throw new TypeError("This interaction has no user.");
		return user;
	}
	get member() {
		return "member" in this.data ? (this.data.member ?? null) : null;
	}
	get locale() {
		return "locale" in this.data ? this.data.locale : undefined;
	}
	get guildLocale() {
		return "guild_locale" in this.data ? this.data.guild_locale : undefined;
	}
	get appPermissions(): Permissions | null {
		return "app_permissions" in this.data &&
			this.data.app_permissions !== undefined
			? new Permissions(this.data.app_permissions)
			: null;
	}
	get memberPermissions(): Permissions | null {
		return this.member ? new Permissions(this.member.permissions) : null;
	}
	get commandId(): string {
		return this.commandData().id;
	}
	get commandName(): string {
		return this.commandData().name;
	}
	private commandData() {
		if (
			this.data.type !== InteractionType.ApplicationCommand &&
			this.data.type !== InteractionType.ApplicationCommandAutocomplete
		)
			throw new TypeError("Not a command interaction.");
		return this.data.data;
	}
	get customId(): string {
		if (
			this.data.type !== InteractionType.MessageComponent &&
			this.data.type !== InteractionType.ModalSubmit
		)
			throw new TypeError("Not a component or modal interaction.");
		return this.data.data.custom_id;
	}
	get values(): string[] {
		return this.isAnySelectMenu() ? this.data.data.values : [];
	}
	get message(): MessageContext | null {
		return "message" in this.data && this.data.message
			? new MessageContext(this.client, this.data.message)
			: null;
	}
	get replyState() {
		return this.interaction.replyState;
	}
	get deferred(): boolean {
		return this.didDefer && this.replyState === "answered";
	}
	get replied(): boolean {
		return !this.didDefer && this.replyState === "answered";
	}
	get ephemeral(): boolean {
		return (
			((this.responseFlags ?? this.message?.data.flags ?? 0) &
				MessageFlags.Ephemeral) !==
			0
		);
	}
	inGuild(): boolean {
		return this.guildId !== null;
	}
	isChatInputCommand(): this is this & ChatInputCommandInteraction {
		return (
			this.data.type === InteractionType.ApplicationCommand &&
			this.data.data.type === ApplicationCommandType.ChatInput
		);
	}
	isContextMenuCommand(): this is this & ContextMenuCommandInteraction {
		return (
			this.data.type === InteractionType.ApplicationCommand &&
			[ApplicationCommandType.User, ApplicationCommandType.Message].includes(
				this.data.data.type,
			)
		);
	}
	isAutocomplete(): this is this & AutocompleteInteraction {
		return this.data.type === InteractionType.ApplicationCommandAutocomplete;
	}
	isMessageComponent(): this is this & MessageComponentInteraction {
		return this.data.type === InteractionType.MessageComponent;
	}
	isButton(): this is this & ButtonInteraction {
		return (
			this.isMessageComponent() &&
			this.data.data.component_type === ComponentType.Button
		);
	}
	isAnySelectMenu(): this is this & SelectMenuInteraction {
		return this.isMessageComponent() && "values" in this.data.data;
	}
	isStringSelectMenu(): this is this & StringSelectMenuInteraction {
		return (
			this.isAnySelectMenu() &&
			this.data.data.component_type === ComponentType.StringSelect
		);
	}
	isModalSubmit(): this is this & ModalSubmitInteraction {
		return this.data.type === InteractionType.ModalSubmit;
	}
	isRepliable(): boolean {
		return !this.isAutocomplete() && this.data.type !== InteractionType.Ping;
	}
	get options(): Options<T> {
		if (!this.resolver) {
			const data = this.data;
			let resolver;
			if (data.type === InteractionType.ApplicationCommandAutocomplete)
				resolver = new AutocompleteInteractionOptionResolver(data);
			else if (
				data.type === InteractionType.ApplicationCommand &&
				data.data.type === ApplicationCommandType.ChatInput
			)
				resolver = new ChatInputInteractionOptionResolver(
					data as APIChatInputApplicationCommandInteraction,
				);
			else if (data.type === InteractionType.ApplicationCommand)
				resolver = new ContextMenuInteractionOptionResolver(
					data as APIContextMenuInteraction,
				);
			else throw new TypeError("This interaction has no command options.");
			this.resolver = resolver as Options<T>;
		}
		return this.resolver;
	}
	get fields(): ModalInteractionOptionResolver {
		if (!this.isModalSubmit()) throw new TypeError("Not a modal submission.");
		return new ModalInteractionOptionResolver(this.data);
	}
	async reply(input: string | InteractionReplyBody): Promise<void> {
		if (!this.isRepliable())
			throw new TypeError(
				"This interaction cannot receive a message response.",
			);
		const { body, files } = messagePayload(input);
		await this.interaction.respond(
			{
				type: InteractionResponseType.ChannelMessageWithSource,
				data: body as APIInteractionResponseCallbackData,
			},
			files,
		);
		this.responseFlags = typeof body.flags === "number" ? body.flags : 0;
	}
	async deferReply(
		data: Pick<InteractionReplyBody, "flags"> = {},
	): Promise<void> {
		if (!this.isRepliable())
			throw new TypeError(
				"This interaction cannot receive a message response.",
			);
		await this.interaction.respond({
			type: InteractionResponseType.DeferredChannelMessageWithSource,
			data,
		} as RESTPostAPIInteractionCallbackJSONBody);
		this.didDefer = true;
		this.responseFlags = data.flags ?? 0;
	}
	async deferUpdate(): Promise<void> {
		if (!this.isMessageComponent() && !(this.isModalSubmit() && this.message))
			throw new TypeError("This interaction has no source message to update.");
		await this.interaction.respond({
			type: InteractionResponseType.DeferredMessageUpdate,
		});
		this.didDefer = true;
	}
	async update(input: string | MessageEditBody): Promise<void> {
		if (!this.isMessageComponent() && !(this.isModalSubmit() && this.message))
			throw new TypeError("This interaction has no source message to update.");
		const { body, files } = messagePayload(input);
		await this.interaction.respond(
			{
				type: InteractionResponseType.UpdateMessage,
				data: body as APIInteractionResponseCallbackData,
			},
			files,
		);
	}
	async showModal(
		modal:
			| APIModalInteractionResponseCallbackData
			| JSONEncodable<APIModalInteractionResponseCallbackData>,
	): Promise<void> {
		if (
			this.isModalSubmit() ||
			this.isAutocomplete() ||
			this.data.type === InteractionType.Ping
		)
			throw new TypeError("This interaction cannot open a modal.");
		await this.interaction.respond({
			type: InteractionResponseType.Modal,
			data: "toJSON" in modal ? modal.toJSON() : modal,
		});
	}
	async respond(choices: APIApplicationCommandOptionChoice[]): Promise<void> {
		if (!this.isAutocomplete())
			throw new TypeError("Only autocomplete interactions accept choices.");
		await this.interaction.respond({
			type: InteractionResponseType.ApplicationCommandAutocompleteResult,
			data: { choices },
		});
	}
	private replyPath(id = "@original"): string {
		return Routes.webhookMessage(this.applicationId, this.data.token, id);
	}
	async fetchReply(id = "@original"): Promise<MessageContext> {
		return new MessageContext(
			this.client,
			await this.client.rest.request<APIMessage>({
				method: "GET",
				path: this.replyPath(id),
				auth: false,
			}),
		);
	}
	async editReply(input: string | MessageEditBody): Promise<MessageContext> {
		return new MessageContext(
			this.client,
			await this.client.rest.request<APIMessage>({
				method: "PATCH",
				path: this.replyPath(),
				...messagePayload(input),
				auth: false,
			}),
		);
	}
	async deleteReply(id = "@original"): Promise<void> {
		await this.client.rest.request({
			method: "DELETE",
			path: this.replyPath(id),
			auth: false,
		});
	}
	async followUp(
		input: string | InteractionReplyBody,
	): Promise<MessageContext> {
		return new MessageContext(
			this.client,
			await this.client.rest.request<APIMessage>({
				method: "POST",
				path: `${Routes.webhook(this.applicationId, this.data.token)}?wait=true`,
				...messagePayload(input),
				auth: false,
			}),
		);
	}
}

export type ChatInputCommandInteraction =
	InteractionContext<APIChatInputApplicationCommandInteraction>;
export type AutocompleteInteraction =
	InteractionContext<APIApplicationCommandAutocompleteInteraction>;
export type ContextMenuCommandInteraction =
	InteractionContext<APIContextMenuInteraction>;
export type MessageComponentInteraction =
	InteractionContext<APIMessageComponentInteraction>;
export type ButtonInteraction =
	InteractionContext<APIMessageComponentButtonInteraction>;
export type SelectMenuInteraction =
	InteractionContext<APIMessageComponentSelectMenuInteraction>;
export type StringSelectMenuInteraction = InteractionContext<
	APIMessageComponentSelectMenuInteraction & {
		data: APIMessageStringSelectInteractionData;
	}
>;
export type ModalSubmitInteraction =
	InteractionContext<APIModalSubmitInteraction>;
export type CommandInteraction =
	ChatInputCommandInteraction | ContextMenuCommandInteraction;
export type RepliableInteraction =
	CommandInteraction | MessageComponentInteraction | ModalSubmitInteraction;
