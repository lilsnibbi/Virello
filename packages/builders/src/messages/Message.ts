import type {
	APIAllowedMentions,
	APIEmbed,
	APIMessageTopLevelComponent,
	RESTAPIAttachment,
	RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import type { JSONEncodable } from "../util/jsonEncodable";
import { isJSONEncodable } from "../util/jsonEncodable";
import { validate } from "../util/validation";
import { AttachmentBuilder, type AttachmentFile } from "./Attachment";
import { messagePredicate } from "./Assertions";
import { validateMessageComponents } from "../util/validateComponents";

/** Message fields supported by the builder. Use native payload objects for other Discord fields or edits. */
export interface MessageBuilderData {
	content?: string;
	embeds?: readonly (APIEmbed | JSONEncodable<APIEmbed>)[];
	components?: readonly (
		APIMessageTopLevelComponent | JSONEncodable<APIMessageTopLevelComponent>
	)[];
	attachments?: readonly (RESTAPIAttachment | AttachmentBuilder)[];
	flags?: number;
	allowed_mentions?: APIAllowedMentions;
}

/** Assemble a new message with validated payloads and Virello multipart uploads. Does not set flags implicitly. */
export class MessageBuilder implements JSONEncodable<RESTPostAPIChannelMessageJSONBody> {
	private data: MessageBuilderData;

	/** Snapshot native data; builders remain live until serialization. */
	constructor(data: MessageBuilderData = {}) {
		this.data = {
			...data,
			embeds: data.embeds?.map((value) =>
				isJSONEncodable(value) ? value : structuredClone(value),
			),
			components: data.components?.map((value) =>
				isJSONEncodable(value) ? value : structuredClone(value),
			),
			attachments: data.attachments?.map((value) =>
				value instanceof AttachmentBuilder ? value : structuredClone(value),
			),
			allowed_mentions:
				data.allowed_mentions && structuredClone(data.allowed_mentions),
		};
	}
	/** Set up to 2000 characters of legacy message content. */
	setContent(content: string): this {
		this.data.content = content;
		return this;
	}
	/** Remove legacy content before selecting Components V2. */
	clearContent(): this {
		this.data.content = undefined;
		return this;
	}
	/** Set native flags explicitly, including IsComponentsV2 or Ephemeral where the endpoint permits them. */
	setFlags(flags: number): this {
		this.data.flags = flags;
		return this;
	}
	/** Set mention parsing explicitly; an empty parse list avoids automatic mentions. */
	setAllowedMentions(mentions: APIAllowedMentions): this {
		this.data.allowed_mentions = structuredClone(mentions);
		return this;
	}
	/** Replace embeds. Calling without arguments clears them. */
	setEmbeds(...embeds: NonNullable<MessageBuilderData["embeds"]>): this {
		this.data.embeds = [...embeds];
		return this;
	}
	/** Replace top-level message components. */
	setComponents(
		...components: NonNullable<MessageBuilderData["components"]>
	): this {
		this.data.components = [...components];
		return this;
	}
	/** Replace uploads and retained attachment metadata. New upload ids are assigned in multipart order. */
	setAttachments(
		...attachments: NonNullable<MessageBuilderData["attachments"]>
	): this {
		this.data.attachments = [...attachments];
		return this;
	}

	private serialize(): {
		body: RESTPostAPIChannelMessageJSONBody;
		files: AttachmentFile[];
	} {
		const { attachments, embeds, components, ...rest } = this.data;
		const files: AttachmentFile[] = [];
		const body = {
			...structuredClone(rest),
			embeds: embeds?.map((value) =>
				isJSONEncodable(value) ? value.toJSON() : structuredClone(value),
			),
			components: components?.map((value) =>
				isJSONEncodable(value) ? value.toJSON() : structuredClone(value),
			),
			attachments: attachments?.map((attachment) => {
				if (!(attachment instanceof AttachmentBuilder))
					return structuredClone(attachment);
				const metadata = attachment.toJSON();
				const file = attachment.getFile();
				if (file) {
					metadata.id = files.length;
					files.push(file);
				}
				return metadata;
			}),
		};
		validate(messagePredicate, body);
		validateMessageComponents(body.components ?? []);
		const ids = body.attachments?.map(({ id }) => String(id)) ?? [];
		if (new Set(ids).size !== ids.length)
			throw new TypeError("Attachment ids must be unique.");
		for (const attachment of body.attachments ?? []) {
			if (typeof attachment.id === "number" && !files[attachment.id])
				throw new TypeError(
					"Numeric attachment ids must refer to a new upload.",
				);
		}
		return { body, files };
	}

	/** Validate and return native JSON only. Use toMessage or toFileBody when uploading files. */
	toJSON(): RESTPostAPIChannelMessageJSONBody {
		return this.serialize().body;
	}
	/** Validate the complete tree and return Virello REST request fields. */
	toFileBody(): {
		body: RESTPostAPIChannelMessageJSONBody;
		files: AttachmentFile[];
	} {
		return this.serialize();
	}
	/** Validate and return a body accepted by message contexts and interaction reply helpers. */
	toMessage(): RESTPostAPIChannelMessageJSONBody & { files: AttachmentFile[] } {
		const { body, files } = this.serialize();
		return { ...body, files };
	}
}
