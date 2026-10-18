// Inspired by DiscordPagination. Copyright (c) 2026 lilsnibbi. MIT; see ../../../../LICENSE and ../../../../docs/source-retention.md.
import { randomUUIDv7 } from "bun";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ContainerBuilder,
	EmbedBuilder,
	LabelBuilder,
	ModalBuilder,
	TextDisplayBuilder,
	TextInputBuilder,
} from "@discordjs/builders";
import {
	type APIContainerComponent,
	ButtonStyle,
	ComponentType,
	MessageFlags,
	TextInputStyle,
} from "discord-api-types/v10";
import type {
	ButtonInteraction,
	InteractionContext as Interaction,
	ModalSubmitInteraction,
	RepliableInteraction,
} from "../../../discord/InteractionContext";
import type { InteractionCollector } from "../../../discord/Collector";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import type { JSONEncodable } from "../../../discord/payloads";
import { Events } from "../../../events/events";
import { RestError } from "../../../engine/rest/RestError";
import { container } from "../../../core/Container";
import { fallbackLogger } from "../../../core/logging/console";
import { writeEvent } from "../../../core/logging/diagnostics";

/** Container-layout placeholder replaced with the current page’s text. */
const DATA: unique symbol = Symbol("paginationData");
/** Container-layout placeholder replaced with pagination controls. */
const BUTTONS: unique symbol = Symbol("paginationButtons");
/** Native component allowed inside a Discord container. */
type ContainerChild = APIContainerComponent["components"][number];
/** Container text, an encodable child component, or the DATA/BUTTONS placeholders. */
export type PaginationLayoutItem =
	string | JSONEncodable<ContainerChild> | typeof DATA | typeof BUTTONS;
/** Message to reply to, or interaction whose reply is created/edited. */
export type PaginationTarget = Message | RepliableInteraction;
/** Built-in or custom reason passed to the end callback. */
export type PaginationEndReason =
	"idle" | "stopped" | "empty" | "singlePage" | "deleted" | "error" | string;
/** Optional label, emoji, and visual style for one pagination button. */
export interface PaginationButtonOptions {
	/** Button text. Defaults to the action’s built-in label or current page/count for jump. */
	label?: string;
	/** Optional Unicode emoji or custom emoji mention (<:name:id> or <a:name:id>). */
	emoji?: string;
	/** Non-link button style. Defaults to ButtonStyle.Secondary. */
	style?:
		| ButtonStyle.Primary
		| ButtonStyle.Secondary
		| ButtonStyle.Success
		| ButtonStyle.Danger;
}
/** Page sizing, controls, timeouts, text replacements, and callbacks. */
export interface PaginationBaseOptions {
	/** Positive integer entries per page. Defaults to 5. */
	entriesPerPage?: number;
	/** Positive collector idle timeout in milliseconds. Defaults to 60000. */
	idleTimeout?: number;
	/** Positive time to wait for each page-jump modal in milliseconds. Defaults to 60000. */
	modalTimeout?: number;
	/** Make a fresh interaction reply ephemeral when true. Defaults to false; existing replies keep their visibility. */
	ephemeral?: boolean;
	/** Show first/last page buttons when true. Defaults to false. */
	showSkipButtons?: boolean;
	/** Text for an empty list. Defaults to No data to show. */
	emptyContent?: string;
	/** Literal nonempty text replacements applied to page text in object-entry order. */
	replacements?: Readonly<Record<string, string>>;
	/** Optional button settings by action: first, back, jump, next, or last. */
	buttons?: Partial<
		Record<"first" | "back" | "jump" | "next" | "last", PaginationButtonOptions>
	>;
	/** Called once after controls stop, with the stop reason. Its async result is awaited; a rejection rejects stop(). */
	onEnd?: (reason: PaginationEndReason) => unknown | Promise<unknown>;
	/** Optional error reporter for failed actions. Its failures are logged with the original error; absent callbacks use framework logging. */
	onError?: (error: unknown) => unknown | Promise<unknown>;
}
/** Choose embed output or a Discord Components V2 container, plus shared pagination settings. */
export type PaginationOptions = PaginationBaseOptions &
	(
		| {
				/** Output mode: embed or container. */
				type: "embed";
				/** Embed template copied at construction. Its description is replaced by page text. Defaults to a new empty embed. */
				embed?: EmbedBuilder;
		  }
		| {
				/** Output mode: embed or container. */
				type: "container";
				/**
				 * Container layout with exactly one DATA and one BUTTONS placeholder. Defaults to [DATA, BUTTONS]. Text becomes
				 * TextDisplay components.
				 */
				layout?: readonly PaginationLayoutItem[];
				/** Optional Discord container accent color. */
				accentColor?: number;
				/** Optional Discord container spoiler flag. */
				spoiler?: boolean;
		  }
	);

const allowed_mentions = { parse: [] as [], replied_user: false };
const actions = ["first", "back", "jump", "next", "last"] as const;
type Action = (typeof actions)[number];
type Mode =
	| { type: "embed"; embed: ReturnType<EmbedBuilder["toJSON"]> }
	| {
			type: "container";
			layout: (ContainerChild | typeof DATA | typeof BUTTONS)[];
			accentColor?: number;
			spoiler?: boolean;
	  };

/** One list, one message, and controls scoped to its original user. */
export class Pagination {
	/** Container-layout placeholder for the current page text. */
	static readonly DATA: typeof DATA = DATA;
	/** Container-layout placeholder for navigation controls. */
	static readonly BUTTONS: typeof BUTTONS = BUTTONS;
	private readonly entries: readonly string[];
	private readonly options: PaginationBaseOptions;
	private readonly mode: Mode;
	private readonly prefix = `virello:${randomUUIDv7()}:`;
	private readonly size: number;
	private readonly pages: number;
	private pageIndex = 0;
	private sent = false;
	private ended = false;
	private owner = "";
	private message?: Message;
	private interaction?: RepliableInteraction;
	private collector?: InteractionCollector<ButtonInteraction>;
	private queue = Promise.resolve();
	private stopping?: Promise<void>;
	private readonly modals = new Set<() => void>();

	/**
	 * Copy a list and output settings for one pagination message.
	 * @param entries - Text entries, joined with newlines on each page.
	 * @param options - Output mode and controls; defaults to embed output with five entries per page.
	 * @throws For invalid sizes/timeouts/layouts or empty/oversized rendered pages. Embed text is capped at 4096 characters;
	 * container text at 4000.
	 */
	constructor(
		entries: readonly string[],
		options: PaginationOptions = { type: "embed" },
	) {
		this.size = options.entriesPerPage ?? 5;
		for (const [name, value] of Object.entries({
			entriesPerPage: this.size,
			idleTimeout: options.idleTimeout ?? 60000,
			modalTimeout: options.modalTimeout ?? 60000,
		}))
			if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647)
				throw new RangeError(
					`${name} must be a positive integer no larger than 2147483647.`,
				);
		if (entries.some((entry) => typeof entry !== "string"))
			throw new TypeError("Pagination entries must be strings.");
		this.entries = [...entries];
		this.pages = Math.max(1, Math.ceil(entries.length / this.size));
		this.options = {
			...options,
			replacements: options.replacements && { ...options.replacements },
			buttons: options.buttons && structuredClone(options.buttons),
		};
		if (options.type === "container") {
			const layout = options.layout ?? [DATA, BUTTONS];
			if (
				layout.filter((item) => item === DATA).length !== 1 ||
				layout.filter((item) => item === BUTTONS).length !== 1
			)
				throw new TypeError(
					"Container layouts need exactly one Pagination.DATA and one Pagination.BUTTONS.",
				);
			this.mode = {
				type: "container",
				accentColor: options.accentColor,
				spoiler: options.spoiler,
				layout: layout.map((item) =>
					item === DATA || item === BUTTONS
						? item
						: typeof item === "string"
							? new TextDisplayBuilder().setContent(item).toJSON()
							: structuredClone(item.toJSON()),
				),
			};
		} else
			this.mode = {
				type: "embed",
				embed: structuredClone((options.embed ?? new EmbedBuilder()).toJSON()),
			};
		for (let page = 0; page < this.pages; page++) {
			const content = this.content(page);
			if (
				!content ||
				content.length > (this.mode.type === "embed" ? 4096 : 4000)
			)
				throw new RangeError(
					`Pagination page ${page + 1} exceeds the text limit or is empty. Reduce entriesPerPage.`,
				);
		}
	}

	/** The displayed page, starting at one. */
	get page(): number {
		return this.pageIndex + 1;
	}
	/** Number of pages, always at least one even for an empty list. */
	get pageCount(): number {
		return this.pages;
	}
	/** Whether this instance has ended and will accept no further page changes. */
	get stopped(): boolean {
		return this.ended;
	}

	/**
	 * Send this instance once, scoping controls to the triggering message author or interaction user. Fresh interactions are
	 * deferred first.
	 * @param target - Message to reply to, or interaction reply to create/edit.
	 * @returns The response message. Empty and single-page lists stop immediately after sending.
	 * @throws For repeated sends, a stopped instance, or Discord send/edit failures.
	 */
	async send(target: PaginationTarget): Promise<Message> {
		if (this.sent || this.ended)
			throw new Error("A Pagination instance can only be sent once.");
		this.sent = true;
		try {
			if ("deferReply" in target) {
				this.interaction = target;
				this.owner = target.user.id;
				if (!target.deferred && !target.replied)
					await target.deferReply({
						flags: this.options.ephemeral ? MessageFlags.Ephemeral : undefined,
					});
				this.message = await target.editReply(this.payload());
			} else {
				this.owner = target.author.id;
				this.message = await target.reply(this.payload());
			}
			if (this.ended) {
				await this.render();
				return this.message;
			}
			if (this.pages === 1) {
				await this.stop(this.entries.length ? "singlePage" : "empty");
				return this.message;
			}
			const collector = this.message.createMessageComponentCollector({
				componentType: ComponentType.Button,
				idle: this.options.idleTimeout ?? 60000,
				filter: (button) =>
					this.action(button.customId) !== undefined &&
					button.user.id === this.owner,
			});
			this.collector = collector;
			collector.on("collect", (button) => {
				void this.handle(button).catch((error) => this.fail(error));
			});
			collector.on("ignore", (button) => {
				if (
					this.action(button.customId) !== undefined &&
					button.user.id !== this.owner
				)
					void button.deferUpdate().catch((error) => this.report(error));
			});
			collector.on("end", (_collected, reason) => {
				void this.stop(reason).catch((error) => this.report(error));
			});
			return this.message;
		} catch (error) {
			this.ended = true;
			this.cleanup();
			throw error;
		}
	}

	/**
	 * End collectors, wait for queued updates, and disable controls. Repeated calls share one promise.
	 * @param reason - End reason; defaults to stopped.
	 * @returns Completion of cleanup and onEnd. Rendering failures are reported; onEnd failures reject.
	 */
	stop(reason: PaginationEndReason = "stopped"): Promise<void> {
		if (this.stopping) return this.stopping;
		this.ended = true;
		// Assign the promise before stopping the collector, whose end event is synchronous.
		this.stopping = Promise.resolve().then(async () => {
			this.cleanup();
			await this.queue;
			try {
				if (this.message) await this.render();
			} catch (error) {
				if (!this.isDeleted(error)) this.report(error);
			}
			await this.options.onEnd?.(reason);
		});
		return this.stopping;
	}

	private cleanup(): void {
		this.collector?.stop("stopped");
		for (const cancel of this.modals) cancel();
		this.modals.clear();
	}
	private action(id: string): Action | undefined {
		return actions.find((action) => id === this.prefix + action);
	}
	private async handle(button: ButtonInteraction): Promise<void> {
		if (this.ended) {
			await button.deferUpdate();
			return;
		}
		const action = this.action(button.customId);
		if (action === "jump") {
			await this.openModal(button);
			return;
		}
		await button.deferUpdate();
		this.enqueue(() => {
			if (action === "first") this.pageIndex = 0;
			else if (action === "last") this.pageIndex = this.pages - 1;
			else
				this.pageIndex = Math.max(
					0,
					Math.min(
						this.pages - 1,
						this.pageIndex + (action === "back" ? -1 : 1),
					),
				);
		});
	}
	private enqueue(change: () => void): void {
		this.queue = this.queue
			.then(async () => {
				if (!this.ended) {
					change();
					await this.render();
				}
			})
			.catch((error) => this.fail(error));
	}
	private async openModal(button: ButtonInteraction): Promise<void> {
		const id = `${this.prefix}jump:${randomUUIDv7()}`;
		const input = "page";
		const modal = new ModalBuilder()
			.setCustomId(id)
			.setTitle("Jump to page")
			.addLabelComponents(
				new LabelBuilder()
					.setLabel(`Page number (1–${this.pages})`)
					.setTextInputComponent(
						new TextInputBuilder()
							.setCustomId(input)
							.setStyle(TextInputStyle.Short)
							.setRequired(true)
							.setMinLength(1)
							.setMaxLength(String(this.pages).length),
					),
			);
		const listener = (interaction: Interaction) => {
			if (
				!interaction.isModalSubmit() ||
				interaction.customId !== id ||
				interaction.user.id !== this.owner
			)
				return;
			cancel();
			void this.submit(interaction, input).catch((error) => this.fail(error));
		};
		const timeout = setTimeout(
			() => cancel(),
			this.options.modalTimeout ?? 60000,
		);
		const cancel = () => {
			clearTimeout(timeout);
			button.client.off(Events.InteractionCreate, listener);
			this.modals.delete(cancel);
		};
		this.modals.add(cancel);
		button.client.on(Events.InteractionCreate, listener);
		try {
			await button.showModal(modal);
		} catch (error) {
			cancel();
			throw error;
		}
	}
	private async submit(
		submission: ModalSubmitInteraction,
		input: string,
	): Promise<void> {
		if (this.ended) {
			await submission.deferUpdate();
			return;
		}
		const value = submission.fields.getTextInput(input).trim();
		const page = /^\d+$/.test(value) ? Number(value) : NaN;
		if (!Number.isSafeInteger(page) || page < 1 || page > this.pages) {
			await submission.reply({
				content: `Choose a page from 1 to ${this.pages}.`,
				flags: MessageFlags.Ephemeral,
				allowed_mentions,
			});
			return;
		}
		await submission.deferUpdate();
		if (!this.ended) this.collector?.resetTimer();
		this.enqueue(() => {
			this.pageIndex = page - 1;
		});
	}
	private content(page: number): string {
		let text = this.entries.length
			? this.entries.slice(page * this.size, (page + 1) * this.size).join("\n")
			: (this.options.emptyContent ?? "No data to show");
		for (const [key, value] of Object.entries(this.options.replacements ?? {}))
			if (key) text = text.replaceAll(key, () => value);
		return text;
	}
	private row(): ActionRowBuilder<ButtonBuilder> {
		const create = (action: Action, label: string, disabled: boolean) => {
			const options = this.options.buttons?.[action];
			const button = new ButtonBuilder()
				.setCustomId(this.prefix + action)
				.setLabel(options?.label ?? label)
				.setStyle(options?.style ?? ButtonStyle.Secondary)
				.setDisabled(this.ended || disabled);
			if (options?.emoji) {
				const match = /^<(a?):([\w]+):(\d+)>$/.exec(options.emoji);
				button.setEmoji(
					match
						? { animated: match[1] === "a", name: match[2], id: match[3] }
						: { name: options.emoji },
				);
			}
			return button;
		};
		const buttons = [
			create("back", "Previous", this.pageIndex === 0),
			create("jump", `${this.page}/${this.pages}`, this.pages === 1),
			create("next", "Next", this.pageIndex === this.pages - 1),
		];
		if (this.options.showSkipButtons) {
			buttons.unshift(create("first", "First", this.pageIndex === 0));
			buttons.push(create("last", "Last", this.pageIndex === this.pages - 1));
		}
		return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
	}
	private payload() {
		const mode = this.mode;
		if (mode.type === "embed")
			return {
				embeds: [
					new EmbedBuilder(mode.embed).setDescription(
						this.content(this.pageIndex),
					),
				],
				components: this.entries.length ? [this.row()] : [],
				allowed_mentions,
			};
		const components = mode.layout.flatMap((item) =>
			item === DATA
				? [
						new TextDisplayBuilder()
							.setContent(this.content(this.pageIndex))
							.toJSON(),
					]
				: item === BUTTONS
					? this.entries.length
						? [this.row().toJSON()]
						: []
					: [structuredClone(item)],
		);
		return {
			components: [
				new ContainerBuilder({
					components,
					accent_color: mode.accentColor,
					spoiler: mode.spoiler,
				}),
			],
			flags: MessageFlags.IsComponentsV2 as const,
			allowed_mentions,
		};
	}
	private async render(): Promise<void> {
		if (this.interaction) await this.interaction.editReply(this.payload());
		else await this.message?.edit(this.payload());
	}
	private isDeleted(error: unknown): boolean {
		return (
			error instanceof RestError &&
			typeof error.body === "object" &&
			error.body !== null &&
			"code" in error.body &&
			error.body.code === 10008
		);
	}
	private fail(error: unknown): void {
		if (!this.isDeleted(error)) this.report(error);
		void this.stop(this.isDeleted(error) ? "deleted" : "error").catch((cause) =>
			this.report(cause),
		);
	}
	private report(error: unknown): void {
		if (!this.options.onError) {
			this.logError(error);
			return;
		}
		const callbackFailed = (cause: unknown) =>
			this.logError(
				new AggregateError([error, cause], "Pagination error callback failed."),
			);
		try {
			void Promise.resolve(this.options.onError(error)).catch(callbackFailed);
		} catch (cause) {
			callbackFailed(cause);
		}
	}
	private logError(error: unknown): void {
		try {
			writeEvent(container.logger ?? fallbackLogger(), "error", {
				component: "pagination",
				event: "interaction_failed",
				message:
					"Paginator action could not complete; inspect the interaction and its error cause.",
				error,
			});
		} catch (cause) {
			writeEvent(fallbackLogger(), "error", {
				component: "pagination",
				event: "error_reporting_failed",
				message:
					"Paginator error callback failed while reporting another failure; inspect both error causes.",
				error: new AggregateError([error, cause]),
			});
		}
	}
}
