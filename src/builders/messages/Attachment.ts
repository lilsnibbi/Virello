// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: uploads are named Blobs, with message-local numeric IDs.
// See src/builders/NOTICE and src/builders/LICENSE.
import type { RESTAPIAttachment } from "discord-api-types/v10";
import type { JSONEncodable } from "../../discord/payloads";
import { validate } from "../util/validation";
import { attachmentPredicate } from "./Assertions";

/** A Virello upload; Bun.file and File are accepted as Blob data. */
export interface AttachmentFile {
	name: string;
	data: Blob;
}

/** Attachment metadata and optional upload bytes. Strings are file content, never paths or URLs. */
export class AttachmentBuilder implements JSONEncodable<RESTAPIAttachment> {
	private readonly data: Partial<RESTAPIAttachment>;
	private file?: Blob;

	/** Supply native metadata, including a snowflake id when retaining an existing attachment. */
	constructor(data: Partial<RESTAPIAttachment> = {}) {
		this.data = structuredClone(data);
	}

	/** Set a retained attachment id. MessageBuilder assigns upload ids from their multipart position. */
	setId(id: string | number): this {
		this.data.id = id;
		return this;
	}
	/** Set the multipart filename and the name used by attachment:// references. */
	setFilename(filename: string): this {
		this.data.filename = filename;
		return this;
	}
	/** Describe the attachment for accessibility, up to 1024 characters. */
	setDescription(description: string): this {
		this.data.description = description;
		return this;
	}
	/** Remove the accessibility description. */
	clearDescription(): this {
		this.data.description = undefined;
		return this;
	}
	/** Store immutable bytes for a new upload; accepts empty files. Byte arrays are copied. */
	setFileData(data: Blob | Uint8Array | string): this {
		this.file =
			data instanceof Blob
				? data
				: new Blob([typeof data === "string" ? data : new Uint8Array(data)]);
		return this;
	}
	/** Retain only metadata; no file will be uploaded. */
	clearFileData(): this {
		this.file = undefined;
		return this;
	}
	/** Override the upload MIME type without changing its bytes. */
	setFileContentType(contentType: string): this {
		if (!this.file)
			throw new TypeError("Set file data before its content type.");
		this.file = this.file.slice(0, this.file.size, contentType);
		return this;
	}
	/** Return a named Blob, or undefined for an existing attachment. */
	getFile(): AttachmentFile | undefined {
		if (this.file === undefined) return undefined;
		const name = this.data.filename;
		if (!name) throw new TypeError("Uploads require a filename.");
		return { name, data: this.file };
	}
	/** Serialize metadata only. A standalone upload uses id 0; MessageBuilder remaps it. */
	toJSON(): RESTAPIAttachment {
		const data = structuredClone(this.data);
		if (this.file !== undefined) data.id = 0;
		validate(attachmentPredicate, data);
		return data as RESTAPIAttachment;
	}
}
