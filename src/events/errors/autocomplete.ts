import { writeEvent } from "../../core/logging/diagnostics";
import { type AutocompleteInteractionPayload, Events } from "../events";
import { Listener } from "../listener";

export class AutocompleteErrorListener extends Listener<
	typeof Events.CommandAutocompleteInteractionError
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.CommandAutocompleteInteractionError });
	}

	public run(error: unknown, context: AutocompleteInteractionPayload) {
		const { name, location } = context.command;
		writeEvent(this.container.logger, "error", {
			component: "commands",
			event: "autocomplete_failed",
			message:
				"Autocomplete could not produce suggestions; inspect this command's autocomplete handler.",
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
