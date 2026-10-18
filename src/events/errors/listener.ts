import { writeEvent } from "../../core/logging/diagnostics";
import { Events, type ListenerErrorPayload } from "../events";
import { Listener } from "../listener";

export class ListenerErrorListener extends Listener<
	typeof Events.ListenerError
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.ListenerError });
	}

	public run(error: unknown, context: ListenerErrorPayload) {
		const { name, event, location } = context.module;
		writeEvent(this.container.logger, "error", {
			component: "events",
			event: "listener_failed",
			message:
				"Event listener execution failed; inspect the named listener and its error cause.",
			error,
			context: { listener: name, event: String(event), path: location.full },
		});
	}
}
