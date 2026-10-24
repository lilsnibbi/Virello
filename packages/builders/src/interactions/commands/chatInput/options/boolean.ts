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
