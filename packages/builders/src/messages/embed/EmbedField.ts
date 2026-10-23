// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
import type { JSONEncodable } from "../../util/jsonEncodable";
import type { APIEmbedField } from "discord-api-types/v10";
import { validate } from "../../util/validation";
import { embedFieldPredicate } from "./Assertions";

/**
 * A builder that creates API-compatible JSON data for embed fields.
 */
export class EmbedFieldBuilder implements JSONEncodable<APIEmbedField> {
	/**
	 * The API data associated with this embed field.
	 */
	private readonly data: Partial<APIEmbedField>;

	/**
	 * Creates a new embed field.
	 *
	 * @param data - The API data to create this embed field with
	 */
	public constructor(data: Partial<APIEmbedField> = {}) {
		this.data = structuredClone(data);
	}

	/**
	 * Sets the name for this embed field.
	 *
	 * @param name - The name to use
	 */
	public setName(name: string): this {
		this.data.name = name;
		return this;
	}

	/**
	 * Sets the value for this embed field.
	 *
	 * @param value - The value to use
	 */
	public setValue(value: string): this {
		this.data.value = value;
		return this;
	}

	/**
	 * Sets whether this field should display inline.
	 *
	 * @param inline - Whether this field should display inline
	 */
	public setInline(inline = true): this {
		this.data.inline = inline;
		return this;
	}

	/**
	 * Serializes this builder to API-compatible JSON data.
	 *
	 */
	public toJSON(): APIEmbedField {
		const clone = structuredClone(this.data);
		validate(embedFieldPredicate, clone);

		return clone as APIEmbedField;
	}
}
