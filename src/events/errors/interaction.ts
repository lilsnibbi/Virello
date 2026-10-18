import { writeEvent } from "../../core/logging/diagnostics";
import { Events, type InteractionHandlerError } from "../events";
import { Listener } from "../listener";

export class InteractionErrorListener extends Listener<
	typeof Events.InteractionHandlerError
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.InteractionHandlerError });
	}

	public run(error: unknown, context: InteractionHandlerError) {
		const { name, location } = context.handler;
		writeEvent(this.container.logger, "error", {
			component: "interactions",
			event: "handler_failed",
			message:
				"Button or modal handling failed; inspect this interaction handler's run method.",
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
