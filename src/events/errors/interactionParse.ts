import { writeEvent } from "../../core/logging/diagnostics";
import {
	Events,
	type InteractionHandlerParseError as InteractionHandlerParseErrorPayload,
} from "../events";
import { Listener } from "../listener";

export class InteractionParseErrorListener extends Listener<
	typeof Events.InteractionHandlerParseError
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.InteractionHandlerParseError });
	}

	public run(error: unknown, context: InteractionHandlerParseErrorPayload) {
		const { name, location } = context.handler;
		writeEvent(this.container.logger, "error", {
			component: "interactions",
			event: "parse_failed",
			message:
				"Interaction matching failed before execution; inspect this handler's parse method.",
			error,
			context: {
				handler: name,
				path: location.full,
				requestId: context.interaction?.id,
				guildId: context.interaction?.guildId,
			},
		});
	}
}
