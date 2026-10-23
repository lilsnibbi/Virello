// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
import {
	type APIApplicationCommandStringOption,
	ApplicationCommandOptionType,
} from "discord-api-types/v10";
import { Mixin } from "ts-mixer";
import { stringOptionPredicate } from "../Assertions";
import type { ApplicationCommandOptionWithAutocompleteData } from "../mixins/ApplicationCommandOptionWithAutocompleteMixin";
import { ApplicationCommandOptionWithAutocompleteMixin } from "../mixins/ApplicationCommandOptionWithAutocompleteMixin";
import type { ApplicationCommandOptionWithChoicesData } from "../mixins/ApplicationCommandOptionWithChoicesMixin";
import { ApplicationCommandOptionWithChoicesMixin } from "../mixins/ApplicationCommandOptionWithChoicesMixin";
import type { ApplicationCommandOptionBaseData } from "./ApplicationCommandOptionBase";
import { ApplicationCommandOptionBase } from "./ApplicationCommandOptionBase";

export class ChatInputCommandStringOption extends Mixin(
	ApplicationCommandOptionBase,
	ApplicationCommandOptionWithAutocompleteMixin,
	ApplicationCommandOptionWithChoicesMixin<string>,
) {
	/**
	 * @internal
	 */
	protected static override readonly predicate = stringOptionPredicate;

	/**
	 * @internal
	 */
	declare protected readonly data: ApplicationCommandOptionBaseData &
		ApplicationCommandOptionWithAutocompleteData &
		ApplicationCommandOptionWithChoicesData &
		Partial<
			Pick<APIApplicationCommandStringOption, "max_length" | "min_length">
		>;

	/**
	 * Creates a new string option builder.
	 */
	public constructor() {
		super(ApplicationCommandOptionType.String);
	}

	/**
	 * Sets the maximum length of this string option.
	 *
	 * @param max - The maximum length this option can be
	 */
	public setMaxLength(max: number): this {
		this.data.max_length = max;
		return this;
	}

	/**
	 * Clears the maximum length of this string option.
	 */
	public clearMaxLength(): this {
		this.data.max_length = undefined;
		return this;
	}

	/**
	 * Sets the minimum length of this string option.
	 *
	 * @param min - The minimum length this option can be
	 */
	public setMinLength(min: number): this {
		this.data.min_length = min;
		return this;
	}

	/**
	 * Clears the minimum length of this string option.
	 */
	public clearMinLength(): this {
		this.data.min_length = undefined;
		return this;
	}
}
