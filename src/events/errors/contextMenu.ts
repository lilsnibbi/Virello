import { writeEvent } from "../../core/logging/diagnostics";
import { type ContextMenuCommandErrorPayload, Events } from "../events";
import { Listener } from "../listener";

export class ContextMenuErrorListener extends Listener<
	typeof Events.ContextMenuCommandError
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.ContextMenuCommandError });
	}

	public run(error: unknown, context: ContextMenuCommandErrorPayload) {
		const { name, location } = context.command;
		writeEvent(this.container.logger, "error", {
			component: "commands",
			event: "context_menu_failed",
			message:
				"Context menu command execution failed; inspect its contextMenuRun handler.",
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
