import {
	ApplicationCommandType,
	type RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { validate } from "../../../util/validation";
import { userCommandPredicate } from "./Assertions";
import { ContextMenuCommandBuilder } from "./ContextMenuCommand";

/**
 * A builder that creates API-compatible JSON data for user context menu commands.
 */
export class UserContextCommandBuilder extends ContextMenuCommandBuilder {
	/**
	 * {@inheritDoc CommandBuilder.toJSON}
	 */
	public override toJSON(): RESTPostAPIContextMenuApplicationCommandsJSONBody {
		const data = {
			...structuredClone(this.data),
			type: ApplicationCommandType.User,
		};
		validate(userCommandPredicate, data);

		return data as RESTPostAPIContextMenuApplicationCommandsJSONBody;
	}
}
