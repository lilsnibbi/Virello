import { Command } from "virello/commands";
import {
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "virello/builders";
import { ticketConfig } from "../config";
import { publishTicketPanel } from "../flow";

export default class TicketPanelCommand extends Command {
	static override options: Command.Options = {
		description: "Post the support ticket panel.",
	};
	override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand(
			new SlashCommandBuilder()
				.setName("ticket-panel")
				.setDescription(this.description)
				.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
			{ guildIds: [ticketConfig().guildId] },
		);
	}
	override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const config = ticketConfig();
		if (
			interaction.guildId !== config.guildId ||
			!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
		) {
			await interaction.reply({
				content: "Manage Server is required.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		try {
			await publishTicketPanel(this.container.client, config);
		} catch (error) {
			await interaction.editReply(
				"The panel could not be posted. Check bot permissions and configuration.",
			);
			throw error;
		}
		await interaction.editReply("The support panel was posted.");
	}
}
