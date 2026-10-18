import type { MessageContext as Message } from "../../../discord/MessageContext";
import { writeEvent } from "../../../core/logging/diagnostics";
import { Listener } from "../../../events/listener";
import {
	type MessageSubcommandErrorPayload,
	SubcommandEvents,
} from "../types/Events";
import type { SubcommandMappingMethod } from "../types/mappings";

export class MissingMessageHandlerListener extends Listener<
	typeof SubcommandEvents.SubcommandMappingIsMissingMessageCommandHandler
> {
	public constructor(context: Listener.Context) {
		super(context, {
			event: SubcommandEvents.SubcommandMappingIsMissingMessageCommandHandler,
		});
	}

	public override run(
		_: Message,
		subcommand: SubcommandMappingMethod,
		context: MessageSubcommandErrorPayload,
	) {
		const { name, location } = context.command;
		writeEvent(this.container.logger, "error", {
			component: "subcommands",
			event: "message_handler_missing",
			message:
				"Subcommand mapping references a missing messageRun handler; implement the mapped method.",
			context: {
				command: name,
				subcommand: subcommand.name,
				path: location.full,
			},
		});
	}
}
