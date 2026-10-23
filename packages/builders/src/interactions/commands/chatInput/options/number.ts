// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
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
