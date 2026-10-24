import {
	type APIContextMenuInteraction,
	type APIInteractionDataResolvedGuildMember,
	type APIMessage,
	type APIMessageApplicationCommandInteractionDataResolved,
	type APIUser,
	type APIUserInteractionDataResolved,
	ApplicationCommandType,
} from "discord-api-types/v10";
import type { RequiredIf } from "./util";

/** Service class for resolving (context menu) interaction options while working with the raw API. Based on {@linkplain https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/structures/CommandInteractionOptionResolver.js} */
export class ContextMenuInteractionOptionResolver {
	private readonly interaction: APIContextMenuInteraction;

	/** The interaction resolved data */
	private readonly resolved:
		| APIMessageApplicationCommandInteractionDataResolved
		| APIUserInteractionDataResolved
		| null = null;

	/**
	 * Read a native Discord context-menu payload without HTTP requests.
	 * @param interaction - Native API interaction payload, including any resolved entity tables.
	 */
	public constructor(interaction: APIContextMenuInteraction) {
		this.interaction = interaction;

		this.resolved =
			"resolved" in interaction.data
				? (interaction.data.resolved ?? null)
				: null;
	}

	/** Get the target user for a context menu interaction */
	public getTargetUser(): APIUser {
		if (this.interaction.data.type !== ApplicationCommandType.User) {
			throw new Error(
				"This method can only be used on user context menu interactions",
			);
		}

		return (this.resolved as APIUserInteractionDataResolved).users[
			this.interaction.data.target_id
		];
	}

	/**
	 * Read resolved guild-member data for a user context-menu target.
	 * @param required - Throw when member data is missing. Defaults to false.
	 * @returns Member data, or null when optional and unavailable.
	 * @throws For a non-user context menu, missing required member, or malformed resolved payload.
	 */
	public getTargetMember<Required extends boolean = false>(
		required?: Required,
	): RequiredIf<Required, APIInteractionDataResolvedGuildMember>;
	/**
	 * Read resolved guild-member data for a user context-menu target.
	 * @param required - Throw when member data is missing. Defaults to false.
	 * @returns Member data, or null when optional and unavailable.
	 * @throws For a non-user context menu, missing required member, or malformed resolved payload.
	 */
	public getTargetMember(
		required = false,
	): APIInteractionDataResolvedGuildMember | null {
		if (this.interaction.data.type !== ApplicationCommandType.User) {
			throw new Error(
				"This method can only be used on user context menu interactions",
			);
		}

		const member =
			(this.resolved as APIUserInteractionDataResolved).members?.[
				this.interaction.data.target_id
			] ?? null;

		if (!member && required) {
			throw new Error("Member data is not present");
		}

		return member;
	}

	/** Get the target message for a context menu interaction */
	public getTargetMessage(): APIMessage {
		if (this.interaction.data.type !== ApplicationCommandType.Message) {
			throw new Error(
				"This method can only be used on message context menu interactions",
			);
		}

		return (
			this.resolved as APIMessageApplicationCommandInteractionDataResolved
		).messages[this.interaction.data.target_id];
	}
}
