import { EmbedBuilder } from "@discordjs/builders";
import type { APIUser as User } from "discord-api-types/v10";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import { isFunction } from "../../index";
import { MessageBuilder } from "../builders/MessageBuilder";
import type { AnyInteractableInteraction } from "../utility-types";
import { PaginatedMessage } from "./PaginatedMessage";
import type {
	EmbedResolvable,
	PaginatedMessageResolvedPage,
} from "./PaginatedMessageTypes";

/** This is a LazyPaginatedMessage. Instead of resolving all pages that are functions on {@link PaginatedMessage.run} will resolve when requested. */
export class LazyPaginatedMessage extends PaginatedMessage {
	/**
	 * Resolve the current page and its immediate neighbors at startup, leaving other page functions unevaluated.
	 * @param messageOrInteraction - Original pagination target.
	 * @param target - User allowed to control the pages.
	 */
	public override async resolvePagesOnRun(
		messageOrInteraction: Message | AnyInteractableInteraction,
		target: User,
	): Promise<void> {
		await this.resolvePage(messageOrInteraction, target, this.index);
	}

	/** Resolve the page corresponding with the given index. This also resolves the index's before and after the given index. */
	public override async resolvePage(
		messageOrInteraction: Message | AnyInteractableInteraction,
		target: User,
		index: number,
	): Promise<PaginatedMessageResolvedPage> {
		const promises = [super.resolvePage(messageOrInteraction, target, index)];
		if (this.hasPage(index - 1))
			promises.push(super.resolvePage(messageOrInteraction, target, index - 1));
		if (this.hasPage(index + 1))
			promises.push(super.resolvePage(messageOrInteraction, target, index + 1));

		const [result] = await Promise.all(promises);
		return result;
	}

	/**
	 * Add a page whose MessageBuilder callback is evaluated when that page is resolved.
	 * @param builder - Builder or builder callback.
	 * @returns This handler.
	 */
	public override addPageBuilder(
		builder: MessageBuilder | ((builder: MessageBuilder) => MessageBuilder),
	): this {
		return this.addPage(() =>
			isFunction(builder) ? builder(new MessageBuilder()) : builder,
		);
	}

	/**
	 * Add a lazily resolved text page.
	 * @param content - Page text.
	 * @returns This handler.
	 */
	public override addPageContent(content: string): this {
		return this.addPage(() => ({ content }));
	}

	/**
	 * Add a lazily resolved single-embed page.
	 * @param embed - Embed data or callback receiving a fresh EmbedBuilder.
	 * @returns This handler.
	 */
	public override addPageEmbed(
		embed: EmbedResolvable | ((builder: EmbedBuilder) => EmbedResolvable),
	): this {
		return this.addPage(() => ({
			embeds:
				typeof embed === "function" ? [embed(new EmbedBuilder())] : [embed],
		}));
	}

	/**
	 * Add a lazily resolved embed page.
	 * @param embeds - Embeds or callback receiving ten fresh builders. Results are capped at ten embeds.
	 * @returns This handler.
	 */
	public override addPageEmbeds(
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
		return this.addPage(() => {
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

			return { embeds: processedEmbeds };
		});
	}
}
