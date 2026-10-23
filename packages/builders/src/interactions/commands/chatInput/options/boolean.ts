// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { booleanOptionPredicate } from "../Assertions";
import { ApplicationCommandOptionBase } from "./ApplicationCommandOptionBase";

/**
 * A chat input command boolean option.
 */
export class ChatInputCommandBooleanOption extends ApplicationCommandOptionBase {
	/**
	 * @internal
	 */
	protected static override readonly predicate = booleanOptionPredicate;

	/**
	 * Creates a new boolean option.
	 */
	public constructor() {
		super(ApplicationCommandOptionType.Boolean);
	}
}
