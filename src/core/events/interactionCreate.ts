import type { BaseInteraction as Interaction } from "discord.js";
import { writeEvent } from "../../logging/diagnostics";
import { Events } from "./events";
import { Listener } from "./listener";

export class InteractionCreateListener extends Listener<
	typeof Events.InteractionCreate
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.InteractionCreate });
	}

	public async run(interaction: Interaction) {
		if (interaction.isChatInputCommand()) {
			this.container.client.emit(Events.PossibleChatInputCommand, interaction);
		} else if (interaction.isContextMenuCommand()) {
			this.container.client.emit(
				Events.PossibleContextMenuCommand,
				interaction,
			);
		} else if (interaction.isAutocomplete()) {
			this.container.client.emit(
				Events.PossibleAutocompleteInteraction,
				interaction,
			);
		} else if (
			interaction.isMessageComponent() ||
			interaction.isModalSubmit()
		) {
			await this.container.modules.require("interactions").run(interaction);
		} else {
			writeEvent(this.container.logger, "alert", {
				component: "interactions",
				event: "unhandled_type",
				message:
					"No framework route handles this Discord interaction type; add an appropriate interaction handler.",
				context: { type: interaction.type },
			});
		}
	}
}
