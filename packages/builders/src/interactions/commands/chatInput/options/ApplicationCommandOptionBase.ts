// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
import type { JSONEncodable } from "../../../../util/jsonEncodable";
import type {
	APIApplicationCommandBasicOption,
	APIApplicationCommandOption,
	ApplicationCommandOptionType,
} from "discord-api-types/v10";
import type { z } from "zod";
import { validate } from "../../../../util/validation";
import type { SharedNameAndDescriptionData } from "../../SharedNameAndDescription";
import { SharedNameAndDescription } from "../../SharedNameAndDescription";
import { validateOptions } from "../validateOptions";

export interface ApplicationCommandOptionBaseData extends Partial<
	Pick<APIApplicationCommandOption, "required">
> {
	type: ApplicationCommandOptionType;
}

/**
 * The base application command option builder that contains common symbols for application command builders.
 */
export abstract class ApplicationCommandOptionBase
	extends SharedNameAndDescription
	implements JSONEncodable<APIApplicationCommandBasicOption>
{
	/**
	 * @internal
	 */
	protected static readonly predicate: z.ZodType;

	/**
	 * @internal
	 */
	declare protected readonly data: ApplicationCommandOptionBaseData &
		SharedNameAndDescriptionData;

	/**
	 * Creates a new application command option builder.
	 *
	 * @param type - The type of the option
	 */
	public constructor(type: ApplicationCommandOptionType) {
		super();
		this.data.type = type;
	}

	/**
	 * Sets whether this option is required.
	 *
	 * @param required - Whether this option should be required
	 */
	public setRequired(required = true) {
		this.data.required = required;
		return this;
	}

	/**
	 * Serializes this builder to API-compatible JSON data.
	 *
	 */
	public toJSON(): APIApplicationCommandBasicOption {
		const clone = structuredClone(this.data);
		validate(
			(this.constructor as typeof ApplicationCommandOptionBase).predicate,
			clone,
		);
		validateOptions([clone as APIApplicationCommandBasicOption]);

		return clone as APIApplicationCommandBasicOption;
	}
}
