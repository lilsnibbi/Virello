import { writeEvent } from "../../core/logging/diagnostics";
import { Events, type MessageCommandErrorPayload } from "../events";
import { Listener } from "../listener";

export class MessageErrorListener extends Listener<
	typeof Events.MessageCommandError
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.MessageCommandError });
	}

	public run(error: unknown, context: MessageCommandErrorPayload) {
		const { name, location } = context.command;
		writeEvent(this.container.logger, "error", {
			component: "commands",
			event: "message_command_failed",
			message:
				"Message command execution failed; inspect this command's messageRun handler.",
			error,
			context: {
				command: name,
				path: location.full,
				requestId: context.message?.id,
				guildId: context.message?.guildId,
			},
		});
	}
}
