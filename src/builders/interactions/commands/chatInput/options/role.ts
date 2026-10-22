// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { roleOptionPredicate } from "../Assertions";
import { ApplicationCommandOptionBase } from "./ApplicationCommandOptionBase";

/**
 * A chat input command role option.
 */
export class ChatInputCommandRoleOption extends ApplicationCommandOptionBase {
	/**
	 * @internal
	 */
	protected static override readonly predicate = roleOptionPredicate;

	/**
	 * Creates a new role option.
	 */
	public constructor() {
		super(ApplicationCommandOptionType.Role);
	}
}
