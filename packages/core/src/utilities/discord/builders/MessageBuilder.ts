import type { MessageBody as MessageCreateOptions } from "../../../discord/payloads";

/** One named Blob upload accepted by the native REST client. */
export type MessageBuilderFileResolvable = NonNullable<
	MessageCreateOptions["files"]
>[number];
/** Native message creation options accepted by the builder. */
export type MessageBuilderResolvable = Omit<
	MessageCreateOptions,
	"embed" | "disableMentions" | "reply"
> & {
	/** Native message embeds. setEmbeds caps later assignments at ten. */
	embeds?: MessageCreateOptions["embeds"];
	/** Native message component rows. */
	components?: MessageCreateOptions["components"];
};

/** A message builder class, it implements the {@link MessageCreateOptions} interface. */
export class MessageBuilder implements MessageCreateOptions {
	/** Text-to-speech setting, taken from MessageBuilder.defaults when omitted. Initially undefined. */
	public tts?: MessageCreateOptions["tts"];

	/** Message nonce, taken from MessageBuilder.defaults when omitted. Initially undefined. */
	public nonce?: MessageCreateOptions["nonce"];

	/** The content for the message. If set to undefined and the builder is used to edit, the content will not be replaced. */
	public content?: MessageCreateOptions["content"];

	/** The embeds for the message. If set to undefined and the builder is used to edit, the embed will not be replaced. */
	public embeds?: MessageCreateOptions["embeds"];

	/** The components for the message. If set to undefined and the builder is used to edit, the components will not be replaced. */
	public components?: MessageCreateOptions["components"];

	/** Which mentions should be parsed from the message content. */
	public allowed_mentions?: MessageCreateOptions["allowed_mentions"];

	/** Files to upload. When editing, use attachments to retain existing attachments. */
	public files?: MessageCreateOptions["files"];

	/**
	 * Create mutable message fields using supplied values, then MessageBuilder.defaults for nullish fields.
	 * @param options - Initial native message options. Arrays and objects are retained by reference.
	 */
	public constructor(options?: MessageBuilderResolvable) {
		this.tts = options?.tts ?? MessageBuilder.defaults.tts;
		this.nonce = options?.nonce ?? MessageBuilder.defaults.nonce;
		this.content = options?.content ?? MessageBuilder.defaults.content;
		this.embeds = options?.embeds ?? MessageBuilder.defaults.embeds;
		this.components = options?.components ?? MessageBuilder.defaults.components;
		this.allowed_mentions =
			options?.allowed_mentions ?? MessageBuilder.defaults.allowed_mentions;
		this.files = options?.files ?? MessageBuilder.defaults.files;
	}

	/** Set the value for the {@link MessageBuilder.tts} field. */
	public setTTS(tts?: boolean): this {
		this.tts = tts;
		return this;
	}

	/** Set the value for the {@link MessageBuilder.nonce} field. */
	public setNonce(nonce?: string): this {
		this.nonce = nonce;
		return this;
	}

	/** Set the value for the {@link MessageBuilder.content} field. */
	public setContent(content?: string): this {
		this.content = content;
		return this;
	}

	/** Set the value for the {@link MessageBuilder.embed} field. */
	public setEmbeds(embeds?: MessageCreateOptions["embeds"]): this {
		// Ensure no more than 10 embeds are ever set
		if (embeds && embeds.length > 10) {
			embeds = embeds.slice(0, 10);
		}

		this.embeds = embeds;
		return this;
	}

	/** Set the value for the {@link MessageBuilder.components} field. */
	public setComponents(components?: MessageCreateOptions["components"]): this {
		this.components = components;
		return this;
	}

	/** Set the native allowed_mentions field. */
	public setAllowedMentions(
		allowedMentions?: MessageCreateOptions["allowed_mentions"],
	): this {
		this.allowed_mentions = allowedMentions;
		return this;
	}

	/** Adds a new value for the {@link MessageBuilder.files} field array. */
	public addFile(file: MessageBuilderFileResolvable): this {
		this.files = this.files?.concat(file) ?? [file];
		return this;
	}

	/** Set a single value for the {@link MessageBuilder.files} field array. */
	public setFile(file: MessageBuilderFileResolvable): this {
		this.files = [file];
		return this;
	}

	/** Set the value for the {@link MessageBuilder.files} field. */
	public setFiles(files?: MessageBuilderFileResolvable[]): this {
		this.files = files;
		return this;
	}

	/** The default values for all MessageBuilder instances. */
	public static defaults: MessageBuilderResolvable = {};
}
