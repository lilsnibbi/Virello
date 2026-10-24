import type { ChatInputCommandInteraction } from "discord.js";
import { Events } from "../../../events/events";
import { Listener } from "../../../events/listener";
import type { ChatInputCommand } from "../../types";

export class ResolveListener extends Listener<
	typeof Events.PossibleChatInputCommand
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.PossibleChatInputCommand });
	}

	public run(interaction: ChatInputCommandInteraction) {
		const { client, modules } = this.container;
		const commandStore = modules.require("commands");

		const command =
			commandStore.get(interaction.commandId) ??
			commandStore.get(interaction.commandName);
		if (!command) {
			client.emit(Events.UnknownChatInputCommand, {
				interaction,
				context: {
					commandId: interaction.commandId,
					commandName: interaction.commandName,
				},
			});
			return;
		}

		if (!command.chatInputRun) {
			client.emit(Events.CommandDoesNotHaveChatInputCommandHandler, {
				command,
				interaction,
				context: {
					commandId: interaction.commandId,
					commandName: interaction.commandName,
				},
			});
			return;
		}

		client.emit(Events.PreChatInputCommandRun, {
			command: command as ChatInputCommand,
			context: {
				commandId: interaction.commandId,
				commandName: interaction.commandName,
			},
			interaction,
		});
	}
}
