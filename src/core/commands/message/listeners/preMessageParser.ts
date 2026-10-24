import type { Message } from "discord.js";
import { Events } from "../../../events/events";
import { Listener } from "../../../events/listener";
import { canRunMessageCommand } from "../access";

export class PreMessageParserListener extends Listener<
	typeof Events.PreMessageParsed
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.PreMessageParsed });
	}

	public async run(message: Message) {
		// If the bot cannot run the command due to lack of permissions, return.
		const canRun = await canRunMessageCommand(message);
		if (!canRun) return;

		let prefix: string | null | RegExp = null;
		const mentionPrefix = this.getMentionPrefix(message);
		const { client } = this.container;
		const { regexPrefix } = client.options;

		if (mentionPrefix) {
			if (message.content.length === mentionPrefix.length) {
				client.emit(Events.MentionPrefixOnly, message);
				return;
			}

			prefix = mentionPrefix;
		} else if (regexPrefix && new RegExp(regexPrefix).test(message.content)) {
			prefix = regexPrefix;
		} else {
			const prefixes = await client.fetchPrefix(message);
			const parsed = this.getPrefix(message.content, prefixes);
			if (parsed !== null) prefix = parsed;
		}

		if (prefix === null) client.emit(Events.NonPrefixedMessage, message);
		else client.emit(Events.PrefixedMessage, message, prefix);
	}

	private getMentionPrefix(message: Message): string | null {
		if (this.container.client.disableMentionPrefix) return null;
		// If the content is shorter than 20 characters, or does not start with `<@` then skip early:
		if (message.content.length < 20 || !message.content.startsWith("<@"))
			return null;

		// Calculate the offset and the ID that is being provided
		const [offset, id] =
			message.content[2] === "&"
				? [
						3,
						message.guild?.roles.cache.find(
							(role) => role.tags?.botId === this.container.client.id,
						)?.id,
					]
				: [message.content[2] === "!" ? 3 : 2, this.container.client.id];

		if (!id) return null;

		const offsetWithId = offset + id.length;

		// If the mention doesn't end with `>`, skip early:
		if (message.content[offsetWithId] !== ">") return null;

		// Check whether or not the ID is the same as the managed role ID:
		const mentionId = message.content.substring(offset, offsetWithId);
		if (mentionId === id) return message.content.substring(0, offsetWithId + 1);

		return null;
	}

	private getPrefix(
		content: string,
		prefixes: readonly string[] | string | null,
	): string | null {
		if (prefixes === null) return null;
		const { caseInsensitivePrefixes } = this.container.client.options;

		if (caseInsensitivePrefixes) content = content.toLowerCase();

		if (typeof prefixes === "string") {
			return content.startsWith(
				caseInsensitivePrefixes ? prefixes.toLowerCase() : prefixes,
			)
				? prefixes
				: null;
		}

		return (
			prefixes.find((prefix) =>
				content.startsWith(
					caseInsensitivePrefixes ? prefix.toLowerCase() : prefix,
				),
			) ?? null
		);
	}
}
