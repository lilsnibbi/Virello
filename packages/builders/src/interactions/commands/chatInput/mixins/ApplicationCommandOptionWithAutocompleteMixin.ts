// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
import type {
	APIApplicationCommandIntegerOption,
	APIApplicationCommandNumberOption,
	APIApplicationCommandStringOption,
} from "discord-api-types/v10";

export type AutocompletableOptions =
	| APIApplicationCommandIntegerOption
	| APIApplicationCommandNumberOption
	| APIApplicationCommandStringOption;

export type ApplicationCommandOptionWithAutocompleteData = Pick<
	AutocompletableOptions,
	"autocomplete"
>;

/**
 * This mixin holds choices and autocomplete symbols used for options.
 */
export class ApplicationCommandOptionWithAutocompleteMixin {
	/**
	 * @internal
	 */
	declare protected readonly data: ApplicationCommandOptionWithAutocompleteData;

	/**
	 * Whether this option uses autocomplete.
	 *
	 * @param autocomplete - Whether this option should use autocomplete
	 */
	public setAutocomplete(autocomplete = true): this {
		this.data.autocomplete = autocomplete;
		return this;
	}
}
