import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { Mixin } from "ts-mixer";
import { numberOptionPredicate } from "../Assertions";
import { ApplicationCommandNumericOptionMinMaxValueMixin } from "../mixins/ApplicationCommandNumericOptionMinMaxValueMixin";
import { ApplicationCommandOptionWithAutocompleteMixin } from "../mixins/ApplicationCommandOptionWithAutocompleteMixin";
import { ApplicationCommandOptionWithChoicesMixin } from "../mixins/ApplicationCommandOptionWithChoicesMixin";
import { ApplicationCommandOptionBase } from "./ApplicationCommandOptionBase";

/**
 * A chat input command number option.
 *
 * @mixes {@link ApplicationCommandOptionBase}
 * @mixes {@link ApplicationCommandNumericOptionMinMaxValueMixin}
 * @mixes {@link ApplicationCommandOptionWithAutocompleteMixin}
 * @mixes {@link ApplicationCommandOptionWithChoicesMixin}\<number\>
 */
export class ChatInputCommandNumberOption extends Mixin(
	ApplicationCommandOptionBase,
	ApplicationCommandNumericOptionMinMaxValueMixin,
	ApplicationCommandOptionWithAutocompleteMixin,
	ApplicationCommandOptionWithChoicesMixin<number>,
) {
	/**
	 * @internal
	 */
	protected static override readonly predicate = numberOptionPredicate;

	/**
	 * Creates a new number option.
	 */
	public constructor() {
		super(ApplicationCommandOptionType.Number);
	}
}
