import { writeEvent } from "../../../core/logging/diagnostics";
import { Listener } from "../../../events/listener";
import {
	type ChatInputSubcommandErrorPayload,
	SubcommandEvents,
} from "../types/Events";

export class ChatInputErrorListener extends Listener<
	typeof SubcommandEvents.ChatInputSubcommandError
> {
	public constructor(context: Listener.Context) {
		super(context, { event: SubcommandEvents.ChatInputSubcommandError });
	}

	public override run(
		error: unknown,
		context: ChatInputSubcommandErrorPayload,
	) {
		const { name, location } = context.command;
		writeEvent(this.container.logger, "error", {
			component: "subcommands",
			event: "chat_input_failed",
			message:
				"Slash subcommand execution failed; inspect its mapped chatInputRun handler.",
			error,
			context: {
				command: name,
				path: location.full,
				subcommand: context.matchedSubcommandMapping?.name,
				requestId: context.interaction?.id,
				guildId: context.interaction?.guildId,
			},
		});
	}
}
