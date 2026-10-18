import { type ChatInputCommand } from "../../../commands/types";
import { writeEvent } from "../../../core/logging/diagnostics";
import { Listener } from "../../../events/listener";
import {
	type ChatInputSubcommandErrorPayload,
	SubcommandEvents,
} from "../types/Events";
import type { SubcommandMappingMethod } from "../types/mappings";

export class MissingChatInputHandlerListener extends Listener<
	typeof SubcommandEvents.SubcommandMappingIsMissingChatInputCommandHandler
> {
	public constructor(context: Listener.Context) {
		super(context, {
			event: SubcommandEvents.SubcommandMappingIsMissingChatInputCommandHandler,
		});
	}

	public override run(
		_: ChatInputCommand.Interaction,
		subcommand: SubcommandMappingMethod,
		context: ChatInputSubcommandErrorPayload,
	) {
		const { name, location } = context.command;
		writeEvent(this.container.logger, "error", {
			component: "subcommands",
			event: "chat_input_handler_missing",
			message:
				"Subcommand mapping references a missing chatInputRun handler; implement the mapped method.",
			context: {
				command: name,
				subcommand: subcommand.name,
				path: location.full,
			},
		});
	}
}
