import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { userOptionPredicate } from "../Assertions";
import { ApplicationCommandOptionBase } from "./ApplicationCommandOptionBase";

/**
 * A chat input command user option.
 */
export class ChatInputCommandUserOption extends ApplicationCommandOptionBase {
	/**
	 * @internal
	 */
	protected static override readonly predicate = userOptionPredicate;

	/**
	 * Creates a new user option.
	 */
	public constructor() {
		super(ApplicationCommandOptionType.User);
	}
}
