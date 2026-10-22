// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import type { APIFileUploadComponent } from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { validate } from "../../util/validation";
import { ComponentBuilder } from "../Component";
import { fileUploadPredicate } from "./Assertions";

/**
 * A builder that creates API-compatible JSON data for file uploads.
 */
export class FileUploadBuilder extends ComponentBuilder<APIFileUploadComponent> {
	/**
	 * @internal
	 */
	protected readonly data: Partial<APIFileUploadComponent>;

	/**
	 * Creates a new file upload.
	 *
	 * @param data - The API data to create this file upload with
	 * @example
	 * Creating a file upload from an API data object:
	 * ```ts
	 * const fileUpload = new FileUploadBuilder({
	 * 	custom_id: "file_upload",
	 *  min_values: 2,
	 *  max_values: 5,
	 * });
	 * ```
	 * @example
	 * Creating a file upload using setters and API data:
	 * ```ts
	 * const fileUpload = new FileUploadBuilder({
	 * 	custom_id: "file_upload",
	 *  min_values: 2,
	 *  max_values: 5,
	 * }).setRequired();
	 * ```
	 */
	public constructor(data: Partial<APIFileUploadComponent> = {}) {
		super();
		this.data = { ...structuredClone(data), type: ComponentType.FileUpload };
	}

	/**
	 * Sets the custom id for this file upload.
	 *
	 * @param customId - The custom id to use
	 */
	public setCustomId(customId: string) {
		this.data.custom_id = customId;
		return this;
	}

	/**
	 * Sets the minimum number of file uploads required.
	 *
	 * @param minValues - The minimum values that must be uploaded
	 */
	public setMinValues(minValues: number) {
		this.data.min_values = minValues;
		return this;
	}

	/**
	 * Clears the minimum values.
	 */
	public clearMinValues() {
		this.data.min_values = undefined;
		return this;
	}

	/**
	 * Sets the maximum number of file uploads required.
	 *
	 * @param maxValues - The maximum values that can be uploaded
	 */
	public setMaxValues(maxValues: number) {
		this.data.max_values = maxValues;
		return this;
	}

	/**
	 * Clears the maximum values.
	 */
	public clearMaxValues() {
		this.data.max_values = undefined;
		return this;
	}

	/**
	 * Sets whether this file upload is required.
	 *
	 * @param required - Whether this file upload is required
	 */
	public setRequired(required = true) {
		this.data.required = required;
		return this;
	}

	/**
	 * {@inheritDoc ComponentBuilder.toJSON}
	 */
	public toJSON(): APIFileUploadComponent {
		const clone = structuredClone(this.data);
		validate(fileUploadPredicate, clone);

		return clone as APIFileUploadComponent;
	}
}
