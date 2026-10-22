// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import type { JSONEncodable } from "../../../discord/payloads";
import type { APIEmbedAuthor } from "discord-api-types/v10";
import { validate } from "../../util/validation";
import { embedAuthorPredicate } from "./Assertions";

/**
 * A builder that creates API-compatible JSON data for the embed author.
 */
export class EmbedAuthorBuilder implements JSONEncodable<APIEmbedAuthor> {
	/**
	 * The API data associated with this embed author.
	 */
	private readonly data: Partial<APIEmbedAuthor>;

	/**
	 * Creates a new embed author.
	 *
	 * @param data - The API data to create this embed author with
	 */
	public constructor(data: Partial<APIEmbedAuthor> = {}) {
		this.data = structuredClone(data);
	}

	/**
	 * Sets the name for this embed author.
	 *
	 * @param name - The name to use
	 */
	public setName(name: string): this {
		this.data.name = name;
		return this;
	}

	/**
	 * Sets the URL for this embed author.
	 *
	 * @param url - The url to use
	 */
	public setURL(url: string): this {
		this.data.url = url;
		return this;
	}

	/**
	 * Clears the URL for this embed author.
	 */
	public clearURL(): this {
		this.data.url = undefined;
		return this;
	}

	/**
	 * Sets the icon URL for this embed author.
	 *
	 * @param iconURL - The icon URL to use
	 */
	public setIconURL(iconURL: string): this {
		this.data.icon_url = iconURL;
		return this;
	}

	/**
	 * Clears the icon URL for this embed author.
	 */
	public clearIconURL(): this {
		this.data.icon_url = undefined;
		return this;
	}

	/**
	 * Serializes this builder to API-compatible JSON data.
	 *
	 */
	public toJSON(): APIEmbedAuthor {
		const clone = structuredClone(this.data);
		validate(embedAuthorPredicate, clone);

		return clone as APIEmbedAuthor;
	}
}
