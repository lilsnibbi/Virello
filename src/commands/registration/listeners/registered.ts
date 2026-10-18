import { writeEvent } from "../../../core/logging/diagnostics";
import { Events } from "../../../events/events";
import { Listener } from "../../../events/listener";
import type { ApplicationCommandRegistry } from "../Registry";

export class RegisteredListener extends Listener<
	typeof Events.ApplicationCommandRegistriesRegistered
> {
	public constructor(context: Listener.Context) {
		super(context, {
			event: Events.ApplicationCommandRegistriesRegistered,
			once: true,
		});
	}

	public run(
		registries: Map<string, ApplicationCommandRegistry>,
		timeTaken: number,
	) {
		writeEvent(this.container.logger, "notif", {
			component: "rest.registration",
			event: "completed",
			message: "Command registration pass finished.",
			context: { registries: registries.size, durationMs: timeTaken },
		});
	}
}
