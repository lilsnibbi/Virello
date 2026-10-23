// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
import {
	ApplicationCommandType,
	type RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { validate } from "../../../util/validation";
import { messageCommandPredicate } from "./Assertions";
import { ContextMenuCommandBuilder } from "./ContextMenuCommand";

/**
 * A builder that creates API-compatible JSON data for message context menu commands.
 */
export class MessageContextCommandBuilder extends ContextMenuCommandBuilder {
	/**
	 * {@inheritDoc CommandBuilder.toJSON}
	 */
	public override toJSON(): RESTPostAPIContextMenuApplicationCommandsJSONBody {
		const data = {
			...structuredClone(this.data),
			type: ApplicationCommandType.Message,
		};
		validate(messageCommandPredicate, data);

		return data as RESTPostAPIContextMenuApplicationCommandsJSONBody;
	}
}
