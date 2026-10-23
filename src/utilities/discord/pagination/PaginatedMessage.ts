import {
	ButtonBuilder,
	ChannelSelectMenuBuilder,
	EmbedBuilder,
	MentionableSelectMenuBuilder,
	RoleSelectMenuBuilder,
	StringSelectMenuBuilder,
	UserSelectMenuBuilder,
	type MessageActionRowComponentBuilder,
} from "@virello/builders";

import {
	type APIEmbed,
	ButtonStyle,
	ComponentType,
	InteractionType,
	MessageFlags,
	type Snowflake,
	type APIUser as User,
} from "discord-api-types/v10";
import { InteractionCollector } from "../../../discord/Collector";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import {
	isJSONEncodable,
	type JSONEncodable,
	type MessageBody as BaseMessageOptions,
} from "../../../discord/payloads";
import {
	type Awaitable,
	deepClone,
	isFunction,
	isNullish,
	isObject,
} from "../../index";
import { Time } from "../../time/duration/index";
import { MessageBuilder } from "../builders/MessageBuilder";
import { isAnyInteraction } from "../type-guards";
import type { AnyInteractableInteraction } from "../utility-types";
import type {
	EmbedResolvable,
	PaginatedMessageAction,
	PaginatedMessageComponentUnion,
	PaginatedMessageEmbedResolvable,
	PaginatedMessageInteractionUnion,
	PaginatedMessageInternationalizationContext,
	PaginatedMessageMessageOptionsUnion,
	PaginatedMessageOptions,
	PaginatedMessagePage,
	PaginatedMessageResolvedPage,
	PaginatedMessageSelectMenuOptionsFunction,
	PaginatedMessageWriteableEmbedResolvable,
	PaginatedMessageWrongUserInteractionReplyFunction,
} from "./PaginatedMessageTypes";
import {
	actionIsButtonOrMenu,
	actionIsLinkButton,
	createPartitionedMessageRow,
	isMessageButtonInteractionData,
	isMessageChannelSelectInteractionData,
	isMessageMentionableSelectInteractionData,
	isMessageRoleSelectInteractionData,
	isMessageStringSelectInteractionData,
	isMessageUserSelectInteractionData,
	safelyReplyToInteraction,
} from "./utils";

/** Paginate up to 25 message pages with component actions. Page functions are resolved and cached when run. */
export class PaginatedMessage {
	// #region public static class properties
	/** The default actions of this handler. */
	public static defaultActions: PaginatedMessageAction[] = [
		{
			custom_id: "virello/pagination.goToPage",
			type: ComponentType.StringSelect,
			options: [],
			run: ({ handler, interaction }) =>
				interaction.isStringSelectMenu() &&
				(handler.index = parseInt(interaction.values[0], 10)),
		},
		{
			custom_id: "virello/pagination.firstPage",
			style: ButtonStyle.Primary,
			emoji: { name: "⏪" },
			type: ComponentType.Button,
			run: ({ handler }) => (handler.index = 0),
		},
		{
			custom_id: "virello/pagination.previousPage",
			style: ButtonStyle.Primary,
			emoji: { name: "◀️" },
			type: ComponentType.Button,
			run: ({ handler }) => {
				if (handler.index === 0) {
					handler.index = handler.pages.length - 1;
				} else {
					--handler.index;
				}
			},
		},
		{
			custom_id: "virello/pagination.nextPage",
			style: ButtonStyle.Primary,
			emoji: { name: "▶️" },
			type: ComponentType.Button,
			run: ({ handler }) => {
				if (handler.index === handler.pages.length - 1) {
					handler.index = 0;
				} else {
					++handler.index;
				}
			},
		},
		{
			custom_id: "virello/pagination.goToLastPage",
			style: ButtonStyle.Primary,
			emoji: { name: "⏩" },
			type: ComponentType.Button,
			run: ({ handler }) => (handler.index = handler.pages.length - 1),
		},
		{
			custom_id: "virello/pagination.stop",
			style: ButtonStyle.Danger,
			emoji: { name: "⏹️" },
			type: ComponentType.Button,
			run: ({ collector }) => {
				collector.stop();
			},
		},
	];

	/** A list of `customId` that are bound to actions that will stop the {@link PaginatedMessage}
	 * @default ['virello/pagination.stop'] */
	public static stopPaginatedMessageCustomIds = ["virello/pagination.stop"];

	/** Collector stop reasons that prevent further message edits. */
	public static deletionStopReasons = [
		"messageDelete",
		"channelDelete",
		"guildDelete",
		"threadDelete",
		"clientDestroyed",
	];

	/** Default text before the page number, initially empty. A nonempty prefix gets one trailing space. */
	public static pageIndexPrefix = "";

	/** Default separator between page numbers and existing footer text, initially a bullet. */
	public static embedFooterSeparator = "•";

	/** Active paginations, keyed by the message that started them. Each message gets one active session. */
	public static readonly messages = new Map<string, PaginatedMessage>();

	/** The current {@link InteractionCollector} handlers that are active. */
	public static readonly handlers = new Map<string, PaginatedMessage>();

	/** Shared option-label callback. Receives a one-based page number and defaults to a label such as Page 1. */
	public static selectMenuOptions: PaginatedMessageSelectMenuOptionsFunction = (
		pageIndex,
	) => ({ label: `Page ${pageIndex}` });

	/** Shared callback for replies to other users. Defaults to an ephemeral warning with user and role mentions disabled. */
	public static wrongUserInteractionReply: PaginatedMessageWrongUserInteractionReplyFunction =
		(targetUser: User) => ({
			content: `Please stop interacting with the components on this message. They are only for <@${targetUser.id}>.`,
			flags: MessageFlags.Ephemeral,
			allowed_mentions: { users: [], roles: [] },
		});
	// #endregion

	// #region private static class properties
	/** Resolve the template for the PaginatedMessage. */
	private static resolveTemplate(
		template?: JSONEncodable<APIEmbed> | BaseMessageOptions,
	): BaseMessageOptions {
		if (template === undefined) {
			return {};
		}

		if (isJSONEncodable<APIEmbed | BaseMessageOptions>(template)) {
			return { embeds: [(template as JSONEncodable<APIEmbed>).toJSON()] };
		}

		return template;
	}
	// #endregion

	// #region public class properties
	/** Page definitions to resolve. addPage accepts up to 25 pages. */
	public pages: PaginatedMessagePage[] = [];

	/** The response message used to edit on page changes. */
	public response: Message | AnyInteractableInteraction | null = null;
	private responseMessageId?: string;

	/** The collector used for handling component interactions. */
	public collector: InteractionCollector<PaginatedMessageInteractionUnion> | null =
		null;

	/** Resolved pages cached by zero-based index; null marks a page for resolution again. */
	public messages: (PaginatedMessageResolvedPage | null)[] = [];

	/** The actions which are to be used. */
	public actions = new Map<string, PaginatedMessageAction>();

	/** The page-specific actions which are to be used. */
	public pageActions: (Map<string, PaginatedMessageAction> | null)[] = [];

	/** The handler's current page/message index. */
	public index = 0;

	/** Collector lifetime in milliseconds, despite the idle name. Defaults to 14.5 minutes; component activity does not reset it. */
	public idle = Time.Minute * 14.5;

	/** The template for this {@link PaginatedMessage}. You can use templates to set defaults that will apply to each and every page in the {@link PaginatedMessage} */
	public template: PaginatedMessageMessageOptionsUnion;

	/** Text before the page number. Defaults to the static pageIndexPrefix; a nonempty prefix gets one trailing space. */
	public pageIndexPrefix = PaginatedMessage.pageIndexPrefix;

	/** Separator between page numbers and existing footer text, surrounded by spaces. Defaults to the static embedFooterSeparator. */
	public embedFooterSeparator = PaginatedMessage.embedFooterSeparator;

	/** A list of `customId` that are bound to actions that will stop the {@link PaginatedMessage}
	 * @default ```PaginatedMessage.stopPaginatedMessageCustomIds``` (static property) */
	public stopPaginatedMessageCustomIds =
		PaginatedMessage.stopPaginatedMessageCustomIds;

	// #endregion

	// #region protected class properties
	/** Data for the paginated message. */
	protected paginatedMessageData: Omit<
		PaginatedMessageMessageOptionsUnion,
		"components"
	> | null = null;

	/** The placeholder for the select menu. */
	protected selectMenuPlaceholder: string | undefined = undefined;

	/** Tracks whether a warning was already emitted for this {@link PaginatedMessage} concerning the maximum amount of pages in the {@link SelectMenu}.
	 * @default false */
	protected hasEmittedMaxPageWarning = false;

	/** Add page numbers to embed footers. The separator is unused when this is false.
	 * @default true */
	protected shouldAddFooterToEmbeds = true;

	/** Option-label callback copied from the static default when this instance is created. */
	protected selectMenuOptions: PaginatedMessageSelectMenuOptionsFunction =
		PaginatedMessage.selectMenuOptions;

	/** Reply callback for users other than the target, copied from the static default when this instance is created. */
	protected wrongUserInteractionReply: PaginatedMessageWrongUserInteractionReplyFunction =
		PaginatedMessage.wrongUserInteractionReply;
	// #endregion

	// #region private class fields
	/** The response we send when someone gets into an invalid flow */
	readonly #thisMazeWasNotMeantForYouContent = {
		content: "This maze wasn't meant for you...what did you do.",
	};
	// #endregion

	/** Constructor used by clone and subclass defaults. */
	declare ["constructor"]: typeof PaginatedMessage;

	/** Create a paginator with optional initial pages, actions, and templates. */
	public constructor({
		pages,
		actions,
		template,
		pageIndexPrefix,
		embedFooterSeparator,
		paginatedMessageData = null,
	}: PaginatedMessageOptions = {}) {
		if (pages) this.addPages(pages);

		this.addActions(actions ?? this.constructor.defaultActions);

		this.template = PaginatedMessage.resolveTemplate(template);
		this.pageIndexPrefix = pageIndexPrefix ?? PaginatedMessage.pageIndexPrefix;
		this.embedFooterSeparator =
			embedFooterSeparator ?? PaginatedMessage.embedFooterSeparator;
		this.paginatedMessageData = paginatedMessageData;
	}

	// #region property setters
	/** Set the {@link PaginatedMessage.selectMenuOptions} for this instance of {@link PaginatedMessage}. This will only apply to this one instance and no others. */
	public setSelectMenuOptions(
		newOptions: PaginatedMessageSelectMenuOptionsFunction,
	): this {
		this.selectMenuOptions = newOptions;
		return this;
	}

	/** Set the {@link PaginatedMessage.selectMenuPlaceholder} for this instance of {@link PaginatedMessage}. */
	public setSelectMenuPlaceholder(placeholder: string | undefined): this {
		this.selectMenuPlaceholder = placeholder;
		return this;
	}

	/** Set the {@link PaginatedMessage.wrongUserInteractionReply} for this instance of {@link PaginatedMessage}. This will only apply to this one instance and no others. */
	public setWrongUserInteractionReply(
		wrongUserInteractionReply: PaginatedMessageWrongUserInteractionReplyFunction,
	): this {
		this.wrongUserInteractionReply = wrongUserInteractionReply;
		return this;
	}

	/** Set the {@link PaginatedMessage.stopPaginatedMessageCustomIds} for this instance of {@link PaginatedMessage}. This will only apply to this one instance and no others. */
	public setStopPaginatedMessageCustomIds(
		stopPaginatedMessageCustomIds: string[],
	): this {
		this.stopPaginatedMessageCustomIds = stopPaginatedMessageCustomIds;
		return this;
	}

	/** Set the handler's current page/message index. */
	public setIndex(index: number): this {
		this.index = index;
		return this;
	}

	/**
	 * Set the collector lifetime for the next run.
	 * @param idle - Lifetime in milliseconds; activity does not reset it.
	 * @returns This handler.
	 */
	public setIdle(idle: number): this {
		this.idle = idle;
		return this;
	}

	/** Set the value of {@link shouldAddFooterToEmbeds} property and returns the instance of the class. */
	public setShouldAddFooterToEmbeds(newValue: boolean): this {
		this.shouldAddFooterToEmbeds = newValue;
		return this;
	}
	// #endregion

	// #region actions related methods
	/** Clears all current actions and sets them. The order given is the order they will be used. */
	public setActions(
		actions: PaginatedMessageAction[],
		includeDefaultActions = false,
	): this {
		this.actions.clear();
		return this.addActions([
			...(includeDefaultActions ? PaginatedMessage.defaultActions : []),
			...actions,
		]);
	}

	/** Adds actions to the existing ones. The order given is the order they will be used. */
	public addActions(actions: PaginatedMessageAction[]): this {
		for (const action of actions) this.addAction(action);
		return this;
	}

	/** Adds an action to the existing ones. This will be added as the last action. */
	public addAction(action: PaginatedMessageAction): this {
		if (actionIsLinkButton(action)) {
			this.actions.set(action.url, action);
		} else if (actionIsButtonOrMenu(action)) {
			this.actions.set(action.custom_id, action);
		}

		return this;
	}
	// #endregion

	// #region page related methods
	/** Check whether the handler has a specific page. */
	public hasPage(index: number): boolean {
		return index >= 0 && index < this.pages.length;
	}

	/** Clears all current pages and messages and sets them. The order given is the order they will be used. */
	public setPages(pages: PaginatedMessagePage[]) {
		this.pages = [];
		this.messages = [];
		this.addPages(pages);
		return this;
	}

	/**
	 * Append a page. At 25 pages, warn once and ignore further additions.
	 * @param page - Message data or a page callback.
	 * @returns This handler.
	 */
	public addPage(page: PaginatedMessagePage): this {
		// Do not allow more than 25 pages, and send a warning when people try to do so.
		if (this.pages.length === 25) {
			if (!this.hasEmittedMaxPageWarning) {
				process.emitWarning(
					"Maximum amount of pages exceeded for PaginatedMessage. Please check your instance of PaginatedMessage and ensure that you do not exceed 25 pages total.",
					{
						type: "PaginatedMessageExceededMessagePageAmount",
						code: "PAGINATED_MESSAGE_EXCEEDED_MAXIMUM_AMOUNT_OF_PAGES",
						detail: `If you do need more than 25 pages you can extend the class and overwrite the actions in the constructor.`,
					},
				);
				this.hasEmittedMaxPageWarning = true;
			}

			return this;
		}

		this.pages.push(page);

		return this;
	}

	/**
	 * Replace the current page, clear its resolved data/actions, and resolve it again. This call does not send a Discord
	 * edit.
	 * @param page - New page definition.
	 * @returns This handler after resolution.
	 * @throws If no response exists yet, or page resolution fails.
	 */
	public async updateCurrentPage(page: PaginatedMessagePage): Promise<this> {
		const interaction = this.response;
		const currentIndex = this.index;

		if (interaction === null) {
			throw new Error(
				"You cannot update a page before responding to the interaction.",
			);
		}

		this.pages[currentIndex] = page;
		this.messages[currentIndex] = null;
		this.pageActions[currentIndex]?.clear();

		const target = isAnyInteraction(interaction)
			? interaction.user
			: interaction.author;
		await this.resolvePage(interaction, target, currentIndex);

		return this;
	}

	/**
	 * Append a builder page, evaluating a supplied callback immediately.
	 * @param builder - MessageBuilder or callback receiving a new builder.
	 * @returns This handler.
	 */
	public addPageBuilder(
		builder: MessageBuilder | ((builder: MessageBuilder) => MessageBuilder),
	): this {
		return this.addPage(
			isFunction(builder) ? builder(new MessageBuilder()) : builder,
		);
	}

	/**
	 * Append a builder page whose callback is awaited during page resolution.
	 * @param builder - MessageBuilder or async callback receiving a new builder.
	 * @returns This handler.
	 */
	public addAsyncPageBuilder(
		builder:
			MessageBuilder | ((builder: MessageBuilder) => Promise<MessageBuilder>),
	): this {
		return this.addPage(async () =>
			isFunction(builder) ? builder(new MessageBuilder()) : builder,
		);
	}

	/** Adds a page to the existing ones using simple message content. This will be added as the last page. */
	public addPageContent(content: string): this {
		return this.addPage({ content });
	}

	/**
	 * Append one embed, evaluating a supplied callback immediately.
	 * @param embed - Embed data or callback receiving a new EmbedBuilder.
	 * @returns This handler.
	 */
	public addPageEmbed(
		embed: EmbedResolvable | ((embed: EmbedBuilder) => EmbedResolvable),
	): this {
		return this.addPage({
			embeds: isFunction(embed) ? [embed(new EmbedBuilder())] : [embed],
		});
	}

	/**
	 * Append one embed whose callback is awaited during page resolution.
	 * @param embed - Embed data or callback receiving a new EmbedBuilder.
	 * @returns This handler.
	 */
	public addAsyncPageEmbed(
		embed:
			EmbedResolvable | ((builder: EmbedBuilder) => Awaitable<EmbedResolvable>),
	): this {
		return this.addPage(async () => ({
			embeds: isFunction(embed) ? [await embed(new EmbedBuilder())] : [embed],
		}));
	}

	/**
	 * Append multiple embeds, evaluating a supplied callback immediately and keeping at most ten.
	 * @param embeds - Embeds or callback receiving ten fresh builders.
	 * @returns This handler.
	 */
	public addPageEmbeds(
		embeds:
			| EmbedResolvable[]
			| ((
					embed1: EmbedBuilder,
					embed2: EmbedBuilder,
					embed3: EmbedBuilder,
					embed4: EmbedBuilder,
					embed5: EmbedBuilder,
					embed6: EmbedBuilder,
					embed7: EmbedBuilder,
					embed8: EmbedBuilder,
					embed9: EmbedBuilder,
					embed10: EmbedBuilder,
			  ) => EmbedResolvable[]),
	): this {
		let processedEmbeds = isFunction(embeds)
			? embeds(
					new EmbedBuilder(),
					new EmbedBuilder(),
					new EmbedBuilder(),
					new EmbedBuilder(),
					new EmbedBuilder(),
					new EmbedBuilder(),
					new EmbedBuilder(),
					new EmbedBuilder(),
					new EmbedBuilder(),
					new EmbedBuilder(),
				)
			: embeds;

		if (processedEmbeds.length > 10) {
			processedEmbeds = processedEmbeds.slice(0, 10);
		}

		return this.addPage({ embeds: processedEmbeds });
	}

	/**
	 * Append multiple embeds whose callback is awaited during page resolution, keeping at most ten.
	 * @param embeds - Embeds or async callback receiving ten fresh builders.
	 * @returns This handler.
	 */
	public addAsyncPageEmbeds(
		embeds:
			| EmbedResolvable[]
			| ((
					embed1: EmbedBuilder,
					embed2: EmbedBuilder,
					embed3: EmbedBuilder,
					embed4: EmbedBuilder,
					embed5: EmbedBuilder,
					embed6: EmbedBuilder,
					embed7: EmbedBuilder,
					embed8: EmbedBuilder,
					embed9: EmbedBuilder,
					embed10: EmbedBuilder,
			  ) => Awaitable<EmbedResolvable[]>),
	): this {
		return this.addPage(async () => {
			let processedEmbeds = isFunction(embeds)
				? await embeds(
						new EmbedBuilder(),
						new EmbedBuilder(),
						new EmbedBuilder(),
						new EmbedBuilder(),
						new EmbedBuilder(),
						new EmbedBuilder(),
						new EmbedBuilder(),
						new EmbedBuilder(),
						new EmbedBuilder(),
						new EmbedBuilder(),
					)
				: embeds;

			if (processedEmbeds.length > 10) {
				processedEmbeds = processedEmbeds.slice(0, 10);
			}

			return { embeds: processedEmbeds };
		});
	}

	/** Add pages to the existing ones. The order given is the order they will be used. */
	public addPages(pages: PaginatedMessagePage[]): this {
		for (const page of pages) this.addPage(page);
		return this;
	}

	/** Clear all actions for a page and set the new ones. */
	public setPageActions(
		actions: PaginatedMessageAction[],
		index: number,
	): this {
		if (index < 0 || index > this.pages.length - 1)
			throw new Error("Provided index is out of bounds");

		this.pageActions[index]?.clear();
		this.addPageActions(actions, index);
		return this;
	}

	/** Add the provided actions to a page. */
	public addPageActions(
		actions: PaginatedMessageAction[],
		index: number,
	): this {
		if (index < 0 || index > this.pages.length - 1)
			throw new Error("Provided index is out of bounds");

		for (const action of actions) {
			this.addPageAction(action, index);
		}

		return this;
	}

	/** Add the provided action to a page. */
	public addPageAction(action: PaginatedMessageAction, index: number): this {
		if (index < 0 || index > this.pages.length - 1)
			throw new Error("Provided index is out of bounds");

		const pageActionAtIndex =
			this.pageActions[index] ?? new Map<string, PaginatedMessageAction>();

		if (actionIsLinkButton(action)) {
			pageActionAtIndex.set(action.url, action);
		} else if (actionIsButtonOrMenu(action)) {
			pageActionAtIndex.set(action.custom_id, action);
		}

		this.pageActions[index] = pageActionAtIndex;

		return this;
	}
	// #endregion

	/** Run the {@link PaginatedMessage} and sends the pages corresponding with {@link PaginatedMessage.index}. The handler will start collecting message component interactions. */
	public async run(
		messageOrInteraction: Message | AnyInteractableInteraction,
		target?: User,
	): Promise<this> {
		// Assign the target based on whether a Message or CommandInteraction was passed in
		target ??= isAnyInteraction(messageOrInteraction)
			? messageOrInteraction.user
			: messageOrInteraction.author;

		// Try to get the previous PaginatedMessage for this user
		const paginatedMessage = PaginatedMessage.handlers.get(target.id);

		// If a PaginatedMessage was found then stop it
		paginatedMessage?.collector?.stop();

		// If the message was sent by a bot, then set the response as this one
		if (isAnyInteraction(messageOrInteraction)) {
			if (
				messageOrInteraction.user.bot &&
				messageOrInteraction.user.id === messageOrInteraction.client.user?.id
			) {
				this.response = messageOrInteraction;
			}
		} else if (
			messageOrInteraction.author.bot &&
			messageOrInteraction.author.id === messageOrInteraction.client.user?.id
		) {
			this.response = messageOrInteraction;
		}

		await this.resolvePagesOnRun(messageOrInteraction, target);

		// Sanity checks to handle
		if (!this.messages.length) throw new Error("There are no messages.");
		if (!this.actions.size && !this.pageActions.length)
			throw new Error("There are no actions nor page actions.");

		await this.setUpMessage(messageOrInteraction);
		this.setUpCollector(messageOrInteraction, target);

		const messageId = this.responseMessageId!;

		if (this.collector) {
			this.collector.once("end", () => {
				PaginatedMessage.messages.delete(messageId);
				PaginatedMessage.handlers.delete(target.id);
			});

			PaginatedMessage.messages.set(messageId, this);
			PaginatedMessage.handlers.set(target.id, this);
		}

		return this;
	}

	/** Executed whenever {@link PaginatedMessage.run} is called. */
	public async resolvePagesOnRun(
		messageOrInteraction: Message | AnyInteractableInteraction,
		target: User,
	): Promise<void> {
		for (let i = 0; i < this.pages.length; i++) {
			await this.resolvePage(messageOrInteraction, target, i);
		}
	}

	/**
	 * Resolve a page and its shared/page-specific component actions, reusing an existing cached result.
	 * @param messageOrInteraction - Original pagination target.
	 * @param target - User allowed to control the pages.
	 * @param index - Zero-based page index.
	 * @returns Resolved message data. Page and action callback failures reject.
	 */
	public async resolvePage(
		messageOrInteraction: Message | AnyInteractableInteraction,
		target: User,
		index: number,
	): Promise<PaginatedMessageResolvedPage> {
		// If the message was already processed, do not load it again:
		const message = this.messages[index];
		if (!isNullish(message)) {
			return message;
		}

		// Load the page and return it:
		const resolvedPage = await this.handlePageLoad(this.pages[index], index);
		if (resolvedPage.actions) {
			this.addPageActions(resolvedPage.actions, index);
		}

		const pageSpecificActions = this.pageActions.at(index);
		const resolvedComponents: PaginatedMessageComponentUnion[] = [];

		if (this.pages.length > 1) {
			const sharedActions = await this.handleActionLoad(
				[...this.actions.values()],
				messageOrInteraction,
				target,
			);
			const sharedComponents = createPartitionedMessageRow(sharedActions);

			resolvedComponents.push(...sharedComponents);
		}

		if (pageSpecificActions) {
			const pageActions = await this.handleActionLoad(
				[...pageSpecificActions.values()],
				messageOrInteraction,
				target,
			);
			const pageComponents = createPartitionedMessageRow(pageActions);

			resolvedComponents.push(...pageComponents);
		}

		const resolved = { ...resolvedPage, components: resolvedComponents };
		this.messages[index] = resolved;

		return resolved;
	}

	/**
	 * Create another handler with the same pages, index, and lifetime. Action maps, response, and template are shared with
	 * the original.
	 * @returns The new handler.
	 */
	public clone(): PaginatedMessage {
		const clone = new this.constructor({ pages: this.pages, actions: [] })
			.setIndex(this.index)
			.setIdle(this.idle);
		clone.actions = this.actions;
		clone.pageActions = this.pageActions;
		clone.response = this.response;
		clone.responseMessageId = this.responseMessageId;
		clone.template = this.template;
		return clone;
	}

	/**
	 * Read a page definition, evaluating and awaiting its callback if needed. This does not use the resolved-page cache.
	 * @param index - Array index; negative values count from the end.
	 * @returns Raw page options, or undefined when no page exists. Callback failures reject.
	 */
	public async getPageOptions(
		index: number,
	): Promise<PaginatedMessageMessageOptionsUnion | undefined> {
		const page = this.pages.at(index);
		return isFunction(page) ? page(index, this.pages, this) : page;
	}

	/** Send or edit the current page and retain its message scope. */
	protected async setUpMessage(
		target: Message | AnyInteractableInteraction,
	): Promise<void> {
		const page = {
			...this.messages[this.index]!,
			...(this.paginatedMessageData ?? {}),
		};
		const destination = this.response ?? target;
		if (isAnyInteraction(destination)) {
			let message: Message;
			if (destination.replied || destination.deferred)
				message = await destination.editReply(page);
			else {
				await destination.reply({
					...page,
					content: page.content ?? undefined,
					allowed_mentions: page.allowed_mentions ?? undefined,
					attachments: page.attachments ?? undefined,
				});
				message = await destination.fetchReply();
			}
			// Webhook replies retain their token for edits, including ephemeral messages.
			this.response = destination;
			this.responseMessageId = message.id;
		} else {
			this.response = this.response
				? await destination.edit(page)
				: await destination.client.send(destination.channelId, {
						...page,
						content: page.content ?? undefined,
						allowed_mentions: page.allowed_mentions ?? undefined,
						attachments: page.attachments ?? undefined,
					});
			this.responseMessageId = this.response.id;
		}
	}

	/** Set up the message's collector. */
	protected setUpCollector(
		messageOrInteraction: Message | AnyInteractableInteraction,
		targetUser: User,
	): void {
		if (this.pages.length > 1) {
			this.collector =
				new InteractionCollector<PaginatedMessageInteractionUnion>(
					messageOrInteraction.client,
					{
						filter: (interaction) => {
							if (
								!isNullish(this.response) &&
								interaction.isMessageComponent()
							) {
								const customIdValidation =
									this.actions.has(interaction.customId) ||
									this.pageActions.some((actions) =>
										actions?.has(interaction.customId),
									);

								if (
									isAnyInteraction(messageOrInteraction) &&
									messageOrInteraction.ephemeral
								) {
									return (
										interaction.user.id === targetUser.id && customIdValidation
									);
								}

								return customIdValidation;
							}

							return false;
						},

						time: this.idle,

						guild: messageOrInteraction.guildId ?? undefined,

						channel: messageOrInteraction.channelId ?? undefined,

						interactionType: InteractionType.MessageComponent,

						message: this.responseMessageId,
					},
				)
					.on(
						"collect",
						this.handleCollect.bind(
							this,
							targetUser,
							messageOrInteraction.channel,
						),
					)
					.on("end", this.handleEnd.bind(this));
		}
	}

	/** Handles the load of a page. */
	protected async handlePageLoad(
		page: PaginatedMessagePage,
		index: number,
	): Promise<PaginatedMessageMessageOptionsUnion> {
		// Resolve the options from a function or an object
		const options = isFunction(page)
			? await page(index, this.pages, this)
			: page;

		// Clone the template to leave the original intact
		const clonedTemplate = deepClone(this.template);

		// Apply the template to the page
		const optionsWithTemplate = this.applyTemplate(clonedTemplate, options);

		// Apply the footer to the embed, if any
		return this.applyFooter(optionsWithTemplate, index);
	}

	/** Handles the loading of actions. */
	protected async handleActionLoad(
		actions: PaginatedMessageAction[],
		messageOrInteraction: Message | AnyInteractableInteraction,
		targetUser: User,
	): Promise<MessageActionRowComponentBuilder[]> {
		return Promise.all(
			actions.map<Promise<MessageActionRowComponentBuilder>>(async (action) => {
				// Callback functions are framework metadata, never builder payload data.
				const interaction =
					"run" in action ? (({ run: _run, ...data }) => data)(action) : action;
				if (isMessageButtonInteractionData(interaction)) {
					return new ButtonBuilder(interaction);
				}

				if (isMessageUserSelectInteractionData(interaction)) {
					return new UserSelectMenuBuilder(interaction);
				}

				if (isMessageRoleSelectInteractionData(interaction)) {
					return new RoleSelectMenuBuilder(interaction);
				}

				if (isMessageMentionableSelectInteractionData(interaction)) {
					return new MentionableSelectMenuBuilder(interaction);
				}

				if (isMessageChannelSelectInteractionData(interaction)) {
					return new ChannelSelectMenuBuilder(interaction);
				}

				if (isMessageStringSelectInteractionData(interaction)) {
					return new StringSelectMenuBuilder({
						...interaction,
						...(interaction.custom_id === "virello/pagination.goToPage" && {
							options: await Promise.all(
								this.pages.map(async (_, index) => {
									return {
										...(await this.selectMenuOptions(
											index + 1,
											this.resolvePaginatedMessageInternationalizationContext(
												messageOrInteraction,
												targetUser,
											),
										)),
										value: index.toString(),
									};
								}),
							),
							placeholder: this.selectMenuPlaceholder,
						}),
					});
				}

				throw new Error(
					"Unsupported message component type detected. Validate your code and if you're sure this is a bug in Virello make a report in the server",
				);
			}),
		);
	}

	/** Handles the `collect` event from the collector. */
	protected async handleCollect(
		targetUser: User,
		channel: PaginatedMessageInternationalizationContext["channel"],
		interaction: PaginatedMessageInteractionUnion,
	): Promise<void> {
		if (interaction.user.id === targetUser.id) {
			// Update the response to the latest interaction
			this.response = interaction;

			const action = this.getAction(interaction.customId, this.index);
			if (isNullish(action)) {
				throw new Error("There was no action for the provided custom ID");
			}

			if (actionIsButtonOrMenu(action) && action.run) {
				const previousIndex = this.index;

				await action.run({
					interaction,
					handler: this,
					author: targetUser,
					channel,
					response: this.response,
					collector: this.collector!,
				});

				if (!this.stopPaginatedMessageCustomIds.includes(action.custom_id)) {
					const newIndex =
						previousIndex === this.index ? previousIndex : this.index;
					const updateOptions = await this.resolvePage(
						this.response,
						targetUser,
						newIndex,
					);

					await safelyReplyToInteraction({
						messageOrInteraction: interaction,
						interactionEditReplyContent: updateOptions,
						interactionReplyContent: {
							...this.#thisMazeWasNotMeantForYouContent,
							flags: MessageFlags.Ephemeral,
						},
						componentUpdateContent: updateOptions,
					});
				}
			}
		} else {
			const interactionReplyOptions = await this.wrongUserInteractionReply(
				targetUser,
				interaction.user,
				this.resolvePaginatedMessageInternationalizationContext(
					interaction,
					targetUser,
				),
			);

			await interaction.reply(
				isObject(interactionReplyOptions)
					? interactionReplyOptions
					: {
							content: interactionReplyOptions,
							flags: MessageFlags.Ephemeral,
							allowed_mentions: { users: [], roles: [] },
						},
			);
		}
	}

	/** Handles the `end` event from the collector. */
	protected async handleEnd(
		_: Map<Snowflake, PaginatedMessageInteractionUnion>,
		reason: string,
	): Promise<void> {
		// Ensure no race condition can occur where interacting with the message when the paginated message closes would otherwise result in a DiscordAPIError
		if (
			(reason === "time" || reason === "idle") &&
			this.response !== null &&
			isAnyInteraction(this.response) &&
			this.response.isMessageComponent()
		) {
			await this.response.fetchReply();
		}

		// Remove all listeners from the collector:
		this.collector?.removeAllListeners();

		// Do not remove components if the message, channel, or guild, was deleted:
		if (
			this.response &&
			!PaginatedMessage.deletionStopReasons.includes(reason)
		) {
			await safelyReplyToInteraction({
				messageOrInteraction: this.response,
				interactionEditReplyContent: { components: [] },
				interactionReplyContent: {
					...this.#thisMazeWasNotMeantForYouContent,
					flags: MessageFlags.Ephemeral,
				},
				componentUpdateContent: { components: [] },
				messageMethod: "edit",
				messageMethodContent: { components: [] },
			});
		}
	}

	/**
	 * Copy embeds and add the page count to the last embed footer when enabled. Other message fields are retained.
	 * @param message - Resolved page data.
	 * @param index - Zero-based page index.
	 * @returns Page data with the footer applied.
	 */
	protected applyFooter(
		message: PaginatedMessageMessageOptionsUnion,
		index: number,
	): PaginatedMessageMessageOptionsUnion {
		if (!message.embeds?.length) {
			return message;
		}

		const embedsWithFooterApplied = deepClone(
			message.embeds,
		) as PaginatedMessageWriteableEmbedResolvable;

		const idx = embedsWithFooterApplied.length - 1;
		if (embedsWithFooterApplied.length > 0) {
			let lastEmbed = embedsWithFooterApplied[idx];
			const templateEmbed =
				this.template.embeds?.[idx] ?? this.template.embeds?.[0];
			const jsonTemplateEmbed = isJSONEncodable(templateEmbed)
				? templateEmbed instanceof EmbedBuilder
					? templateEmbed.toData()
					: templateEmbed.toJSON()
				: templateEmbed;

			if (isJSONEncodable(lastEmbed)) {
				lastEmbed =
					lastEmbed instanceof EmbedBuilder
						? lastEmbed.toData()
						: lastEmbed.toJSON();
				embedsWithFooterApplied[idx] = lastEmbed;
			}

			if (this.shouldAddFooterToEmbeds || jsonTemplateEmbed?.footer)
				lastEmbed.footer ??= { text: jsonTemplateEmbed?.footer?.text ?? "" };

			if (this.shouldAddFooterToEmbeds) {
				lastEmbed.footer!.text = `${this.pageIndexPrefix ? `${this.pageIndexPrefix} ` : ""}${index + 1} / ${this.pages.length}${
					lastEmbed.footer!.text
						? ` ${this.embedFooterSeparator} ${lastEmbed.footer!.text}`
						: ""
				}`;
			}
		}

		return {
			...message,
			embeds: embedsWithFooterApplied.map((embed) =>
				new EmbedBuilder(
					embed instanceof EmbedBuilder
						? embed.toData()
						: isJSONEncodable(embed)
							? embed.toJSON()
							: embed,
				).toJSON(),
			),
		};
	}

	/** Create a {@link PaginatedMessageInternationalizationContext} */
	protected resolvePaginatedMessageInternationalizationContext(
		messageOrInteraction: Message | AnyInteractableInteraction,
		targetUser: User,
	): PaginatedMessageInternationalizationContext {
		const context: PaginatedMessageInternationalizationContext = {
			user: targetUser,
			channel: messageOrInteraction.channel,
			guild: messageOrInteraction.guild,
			interactionGuildLocale: isAnyInteraction(messageOrInteraction)
				? messageOrInteraction.guildLocale
				: undefined,
			interactionLocale: isAnyInteraction(messageOrInteraction)
				? messageOrInteraction.locale
				: undefined,
		};

		return context;
	}

	/** Apply a template to the provided options, merging them together and applying the template's embeds. */
	private applyTemplate(
		template: PaginatedMessageMessageOptionsUnion,
		options: PaginatedMessageMessageOptionsUnion,
	): PaginatedMessageMessageOptionsUnion {
		const embedData = this.applyTemplateEmbed(template.embeds, options.embeds);

		return { ...template, ...options, embeds: embedData };
	}

	/** Merge the template into the first page embed, or use the template when no page embeds exist. */
	private applyTemplateEmbed(
		templateEmbed: PaginatedMessageEmbedResolvable,
		pageEmbeds: PaginatedMessageEmbedResolvable,
	): PaginatedMessageEmbedResolvable {
		if (isNullish(pageEmbeds)) {
			return templateEmbed ? [templateEmbed?.[0]] : undefined;
		}

		if (isNullish(templateEmbed)) {
			return pageEmbeds;
		}

		return this.mergeEmbeds(templateEmbed[0], pageEmbeds);
	}

	/** Merges the template embed with an array of page embeds. */
	private mergeEmbeds(
		templateEmbed: Exclude<PaginatedMessageEmbedResolvable, undefined>[0],
		pageEmbeds: Exclude<PaginatedMessageEmbedResolvable, undefined>,
	): Exclude<PaginatedMessageEmbedResolvable, undefined> {
		const mergedEmbeds: PaginatedMessageWriteableEmbedResolvable = [];

		const jsonTemplate = isJSONEncodable(templateEmbed)
			? templateEmbed instanceof EmbedBuilder
				? templateEmbed.toData()
				: templateEmbed.toJSON()
			: templateEmbed;

		for (const pageEmbed of pageEmbeds) {
			const pageJson = isJSONEncodable(pageEmbed)
				? pageEmbed instanceof EmbedBuilder
					? pageEmbed.toData()
					: pageEmbed.toJSON()
				: pageEmbed;

			mergedEmbeds.push({
				title: pageJson.title ?? jsonTemplate.title ?? undefined,
				description:
					pageJson.description ?? jsonTemplate.description ?? undefined,
				url: pageJson.url ?? jsonTemplate.url ?? undefined,
				timestamp:
					(typeof pageJson.timestamp === "string"
						? new Date(pageJson.timestamp).toISOString()
						: pageJson.timestamp) ??
					(typeof jsonTemplate.timestamp === "string"
						? new Date(jsonTemplate.timestamp).toISOString()
						: jsonTemplate.timestamp) ??
					undefined,
				color: pageJson.color ?? jsonTemplate.color ?? undefined,
				fields: this.mergeArrays(jsonTemplate.fields, pageJson.fields),
				author: pageJson.author ?? jsonTemplate.author ?? undefined,
				thumbnail: pageJson.thumbnail ?? jsonTemplate.thumbnail ?? undefined,
				image: pageJson.image ?? jsonTemplate.image ?? undefined,
				video: pageJson.video ?? jsonTemplate.video ?? undefined,
				footer: pageJson.footer ?? jsonTemplate.footer ?? undefined,
			});
		}

		return mergedEmbeds;
	}

	/** Merges two arrays together. @template T - The type of elements in the arrays. */
	private mergeArrays<T>(template?: T[], array?: T[]): undefined | T[] {
		if (isNullish(array)) {
			return template;
		}

		if (isNullish(template)) {
			return array;
		}

		return [...template, ...array];
	}

	/** Get the PaginatedMessageAction associated with the provided customId and index. */
	private getAction(
		customId: string,
		index: number,
	): PaginatedMessageAction | undefined {
		const action = this.actions.get(customId);
		if (action) return action;
		return this.pageActions.at(index)?.get(customId);
	}
}
