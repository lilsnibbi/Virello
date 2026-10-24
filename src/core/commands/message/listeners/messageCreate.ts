import type { Message } from "discord.js";
import { Events } from "../../../events/events";
import { Listener } from "../../../events/listener";

export class MessageCreateListener extends Listener<
	typeof Events.MessageCreate
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.MessageCreate });
	}

	public run(message: Message) {
		// Stop bots and webhooks from running commands.
		if (message.author.bot || message.webhookId) return;

		// Run the message parser.
		this.container.client.emit(Events.PreMessageParsed, message);
	}
}
