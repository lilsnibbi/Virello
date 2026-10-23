import type { MessageContext as Message } from "../../../discord/MessageContext";
import { Args } from "../../../commands/arguments/Args";
import { writeEvent } from "@virello/logging/diagnostics";
import { Listener } from "../../../events/listener";
import {
	type MessageSubcommandNoMatchContext,
	SubcommandEvents,
} from "../types/Events";

export class MessageNoMatchListener extends Listener<
	typeof SubcommandEvents.MessageSubcommandNoMatch
> {
	public constructor(context: Listener.Context) {
		super(context, { event: SubcommandEvents.MessageSubcommandNoMatch });
	}

	public override run(
		_message: Message,
		_args: Args,
		context: MessageSubcommandNoMatchContext,
	) {
		writeEvent(this.container.logger, "error", {
			component: "subcommands",
			event: "message_no_match",
			message:
				"No message subcommand route matched; check the configured subcommand names and defaults.",
			context: { command: context.command.name },
		});
	}
}
