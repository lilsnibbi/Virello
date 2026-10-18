import { MessageFlags } from "discord-api-types/v10";
import { logEvent } from "virello/client";
import { Command } from "virello/commands";
import { registerCommand } from "../registration";

export default class ShardCommand extends Command {
	static override options: Command.Options = {
		description: "Ask one specific shard for its stats.",
	};

	override registerApplicationCommands(registry: Command.Registry): void {
		registerCommand(registry, (builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addIntegerOption((option) =>
					option
						.setName("id")
						.setDescription("Shard ID, starting at 0.")
						.setMinValue(0)
						.setRequired(true),
				),
		);
	}

	override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		if (this.container.client.maintenance) {
			await interaction.reply({
				content:
					"Shard coordination is temporarily unavailable. Please try again shortly.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const id = interaction.options.getInteger("id", true);
		const sharding = this.container.client.sharding;
		if (id >= sharding.shardCount) {
			await interaction.editReply(
				`Choose a shard from 0 to ${sharding.shardCount - 1}.`,
			);
			return;
		}
		try {
			const stats = await sharding.request(id, "exampleStats", null, {
				timeoutMs: 5000,
			});
			await interaction.editReply(
				`Shard ${stats.shard}: ${stats.guilds} servers, ${stats.memoryMb} MB, up ${stats.uptimeSeconds}s. Discord ${stats.ready ? "ready" : "not connected"}.`,
			);
		} catch (error) {
			logEvent(this.container.logger, "error", {
				component: "bot.commands",
				event: "shard_stats_failed",
				message:
					"The requested shard did not return statistics; inspect that shard's host connection and process state.",
				context: { command: this.name, shard: id, requestId: interaction.id },
				error,
			});
			await interaction.editReply(
				`Shard ${id} did not respond. Check its host's logs.`,
			);
		}
	}
}
