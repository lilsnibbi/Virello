// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { attachmentOptionPredicate } from "../Assertions";
import { ApplicationCommandOptionBase } from "./ApplicationCommandOptionBase";

/**
 * A chat input command attachment option.
 */
export class ChatInputCommandAttachmentOption extends ApplicationCommandOptionBase {
	/**
	 * @internal
	 */
	protected static override readonly predicate = attachmentOptionPredicate;

	/**
	 * Creates a new attachment option.
	 */
	public constructor() {
		super(ApplicationCommandOptionType.Attachment);
	}
}
