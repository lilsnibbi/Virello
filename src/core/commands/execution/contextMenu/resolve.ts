import type { ContextMenuCommandInteraction } from "discord.js";
import { Events } from "../../../events/events";
import { Listener } from "../../../events/listener";
import type { ContextMenuCommand } from "../../types";

export class ResolveListener extends Listener<
	typeof Events.PossibleContextMenuCommand
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.PossibleContextMenuCommand });
	}

	public run(interaction: ContextMenuCommandInteraction) {
		const { client, modules } = this.container;
		const commandStore = modules.require("commands");

		const command =
			commandStore.get(interaction.commandId) ??
			commandStore.get(interaction.commandName);
		if (!command) {
			client.emit(Events.UnknownContextMenuCommand, {
				interaction,
				context: {
					commandId: interaction.commandId,
					commandName: interaction.commandName,
				},
			});
			return;
		}

		if (!command.contextMenuRun) {
			client.emit(Events.CommandDoesNotHaveContextMenuCommandHandler, {
				command,
				interaction,
				context: {
					commandId: interaction.commandId,
					commandName: interaction.commandName,
				},
			});
			return;
		}

		client.emit(Events.PreContextMenuCommandRun, {
			command: command as ContextMenuCommand,
			context: {
				commandId: interaction.commandId,
				commandName: interaction.commandName,
			},
			interaction,
		});
	}
}
