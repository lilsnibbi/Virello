// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import type { JSONEncodable } from "../../../discord/payloads";
import type { APIEmbedFooter } from "discord-api-types/v10";
import { validate } from "../../util/validation";
import { embedFooterPredicate } from "./Assertions";

/**
 * A builder that creates API-compatible JSON data for the embed footer.
 */
export class EmbedFooterBuilder implements JSONEncodable<APIEmbedFooter> {
	/**
	 * The API data associated with this embed footer.
	 */
	private readonly data: Partial<APIEmbedFooter>;

	/**
	 * Creates a new embed footer.
	 *
	 * @param data - The API data to create this embed footer with
	 */
	public constructor(data: Partial<APIEmbedFooter> = {}) {
		this.data = structuredClone(data);
	}

	/**
	 * Sets the text for this embed footer.
	 *
	 * @param text - The text to use
	 */
	public setText(text: string): this {
		this.data.text = text;
		return this;
	}

	/**
	 * Sets the url for this embed footer.
	 *
	 * @param url - The url to use
	 */
	public setIconURL(url: string): this {
		this.data.icon_url = url;
		return this;
	}

	/**
	 * Clears the icon URL for this embed footer.
	 */
	public clearIconURL(): this {
		this.data.icon_url = undefined;
		return this;
	}

	/**
	 * Serializes this builder to API-compatible JSON data.
	 *
	 */
	public toJSON(): APIEmbedFooter {
		const clone = structuredClone(this.data);
		validate(embedFooterPredicate, clone);

		return clone as APIEmbedFooter;
	}
}
