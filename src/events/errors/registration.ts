import type { Command } from "../../commands/Command";
import { writeEvent } from "../../core/logging/diagnostics";
import { Events } from "../events";
import { Listener } from "../listener";

export class RegistrationErrorListener extends Listener<
	typeof Events.CommandApplicationCommandRegistryError
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.CommandApplicationCommandRegistryError });
	}

	public run(error: unknown, command: Command) {
		const { name, location } = command;
		writeEvent(this.container.logger, "error", {
			component: "rest.registration",
			event: "command_registration_failed",
			message:
				"Command registration could not complete; inspect this command definition and its API error.",
			error,
			context: { command: name, path: location.full },
		});
	}
}
