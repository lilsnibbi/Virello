import { type ChatInputCommand } from "../../../commands/types";
import { writeEvent } from "../../../core/logging/diagnostics";
import { Listener } from "../../../events/listener";
import {
	type ChatInputSubcommandNoMatchContext,
	SubcommandEvents,
} from "../types/Events";

export class ChatInputNoMatchListener extends Listener<
	typeof SubcommandEvents.ChatInputSubcommandNoMatch
> {
	public constructor(context: Listener.Context) {
		super(context, { event: SubcommandEvents.ChatInputSubcommandNoMatch });
	}

	public override run(
		_interaction: ChatInputCommand.Interaction,
		context: ChatInputSubcommandNoMatchContext,
	) {
		writeEvent(this.container.logger, "error", {
			component: "subcommands",
			event: "chat_input_no_match",
			message:
				"No slash subcommand route matched; check the configured subcommand names and defaults.",
			context: { command: context.command.name },
		});
	}
}
