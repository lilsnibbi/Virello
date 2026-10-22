// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import type { JSONEncodable } from "../../../discord/payloads";
import type { APIMediaGalleryItem } from "discord-api-types/v10";
import { validate } from "../../util/validation";
import { mediaGalleryItemPredicate } from "./Assertions";

export class MediaGalleryItemBuilder implements JSONEncodable<APIMediaGalleryItem> {
	private readonly data: Partial<APIMediaGalleryItem>;

	/**
	 * Creates a new media gallery item.
	 *
	 * @param data - The API data to create this media gallery item with
	 * @example
	 * Creating a media gallery item from an API data object:
	 * ```ts
	 * const item = new MediaGalleryItemBuilder({
	 * 	description: "Some text here",
	 * 	media: {
	 * 		url: 'https://cdn.discordapp.com/embed/avatars/2.png',
	 * 	},
	 * });
	 * ```
	 * @example
	 * Creating a media gallery item using setters and API data:
	 * ```ts
	 * const item = new MediaGalleryItemBuilder({
	 * 	media: {
	 * 		url: 'https://cdn.discordapp.com/embed/avatars/5.png',
	 * 	},
	 * })
	 * 	.setDescription("alt text");
	 * ```
	 */
	public constructor(data: Partial<APIMediaGalleryItem> = {}) {
		this.data = structuredClone(data);
	}

	/**
	 * Sets the source URL of this media gallery item.
	 *
	 * @param url - The URL to use
	 */
	public setURL(url: string) {
		this.data.media = { url };
		return this;
	}

	/**
	 * Sets the description of this thumbnail.
	 *
	 * @param description - The description to use
	 */
	public setDescription(description: string) {
		this.data.description = description;
		return this;
	}

	/**
	 * Clears the description of this thumbnail.
	 */
	public clearDescription() {
		this.data.description = undefined;
		return this;
	}

	/**
	 * Sets the spoiler status of this thumbnail.
	 *
	 * @param spoiler - The spoiler status to use
	 */
	public setSpoiler(spoiler = true) {
		this.data.spoiler = spoiler;
		return this;
	}

	/**
	 * Transforms this object to its JSON format
	 */
	public toJSON(): APIMediaGalleryItem {
		const clone = structuredClone(this.data);
		validate(mediaGalleryItemPredicate, clone);

		return clone as APIMediaGalleryItem;
	}
}
