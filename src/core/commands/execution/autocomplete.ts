import type { AutocompleteInteraction } from "discord.js";
import { Events } from "../../events/events";
import { Listener } from "../../events/listener";
import type { AutocompleteCommand } from "../types";

export class AutocompleteListener extends Listener<
	typeof Events.PossibleAutocompleteInteraction
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.PossibleAutocompleteInteraction });
	}

	public async run(interaction: AutocompleteInteraction) {
		const { modules } = this.container;

		const commandStore = modules.require("commands");

		// Try resolving in command
		const command =
			commandStore.get(interaction.commandId) ??
			commandStore.get(interaction.commandName);

		if (command?.autocompleteRun) {
			try {
				await command.autocompleteRun(interaction);
				this.container.client.emit(
					Events.CommandAutocompleteInteractionSuccess,
					{
						command: command as AutocompleteCommand,
						context: {
							commandId: interaction.commandId,
							commandName: interaction.commandName,
						},
						interaction,
					},
				);
			} catch (err) {
				this.container.client.emit(
					Events.CommandAutocompleteInteractionError,
					err,
					{
						command: command as AutocompleteCommand,
						context: {
							commandId: interaction.commandId,
							commandName: interaction.commandName,
						},
						interaction,
					},
				);
			}
			return;
		}

		// Unless we ran a command handler, always call interaction handlers with the interaction
		await this.container.modules.require("interactions").run(interaction);
	}
}
