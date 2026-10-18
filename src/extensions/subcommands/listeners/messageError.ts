import { writeEvent } from "../../../core/logging/diagnostics";
import { Listener } from "../../../events/listener";
import {
	type MessageSubcommandErrorPayload,
	SubcommandEvents,
} from "../types/Events";

export class MessageErrorListener extends Listener<
	typeof SubcommandEvents.MessageSubcommandError
> {
	public constructor(context: Listener.Context) {
		super(context, { event: SubcommandEvents.MessageSubcommandError });
	}

	public override run(error: unknown, context: MessageSubcommandErrorPayload) {
		const { name, location } = context.command;
		writeEvent(this.container.logger, "error", {
			component: "subcommands",
			event: "message_command_failed",
			message:
				"Message subcommand execution failed; inspect its mapped messageRun handler.",
			error,
			context: {
				command: name,
				path: location.full,
				subcommand: context.matchedSubcommandMapping?.name,
				requestId: context.message?.id,
				guildId: context.message?.guildId,
			},
		});
	}
}
