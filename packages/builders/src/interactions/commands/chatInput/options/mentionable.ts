// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { mentionableOptionPredicate } from "../Assertions";
import { ApplicationCommandOptionBase } from "./ApplicationCommandOptionBase";

/**
 * A chat input command mentionable option.
 */
export class ChatInputCommandMentionableOption extends ApplicationCommandOptionBase {
	/**
	 * @internal
	 */
	protected static override readonly predicate = mentionableOptionPredicate;

	/**
	 * Creates a new mentionable option.
	 */
	public constructor() {
		super(ApplicationCommandOptionType.Mentionable);
	}
}
