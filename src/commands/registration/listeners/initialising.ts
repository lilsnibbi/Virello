import { writeEvent } from "../../../core/logging/diagnostics";
import { Events } from "../../../events/events";
import { Listener } from "../../../events/listener";

export class InitialisingListener extends Listener<
	typeof Events.ApplicationCommandRegistriesInitialising
> {
	public constructor(context: Listener.Context) {
		super(context, {
			event: Events.ApplicationCommandRegistriesInitialising,
			once: true,
		});
	}

	public run() {
		writeEvent(this.container.logger, "debug", {
			component: "rest.registration",
			event: "started",
			message: "Checking which Discord commands need to be created or updated.",
		});
	}
}
