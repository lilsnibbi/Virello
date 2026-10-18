import { writeEvent } from "../../core/logging/diagnostics";
import { type ChatInputCommandErrorPayload, Events } from "../events";
import { Listener } from "../listener";

export class ChatInputErrorListener extends Listener<
	typeof Events.ChatInputCommandError
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.ChatInputCommandError });
	}

	public run(error: unknown, context: ChatInputCommandErrorPayload) {
		const { name, location } = context.command;
		writeEvent(this.container.logger, "error", {
			component: "commands",
			event: "chat_input_failed",
			message:
				"Slash command execution failed; inspect this command's chatInputRun handler.",
			error,
			context: {
				command: name,
				path: location.full,
				requestId: context.interaction?.id,
				guildId: context.interaction?.guildId,
			},
		});
	}
}
