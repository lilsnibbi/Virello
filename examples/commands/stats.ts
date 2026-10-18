import { MessageFlags } from "discord-api-types/v10";
import { logEvent } from "virello/client";
import { Command } from "virello/commands";
import { registerCommand } from "../registration";
import { formatStats, summarizeStats } from "../stats";

export default class StatsCommand extends Command {
	static override options: Command.Options = {
		description: "Ask every shard for its current stats.",
	};

	override registerApplicationCommands(registry: Command.Registry): void {
		registerCommand(registry, (builder) =>
			builder.setName(this.name).setDescription(this.description),
		);
	}

	override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const results = await this.container.client.sharding.broadcast(
			"exampleStats",
			null,
			{ timeoutMs: 5000 },
		);
		const failed = results.filter((result) => !result.ok);
		if (failed.length)
			logEvent(this.container.logger, "alert", {
				component: "bot.commands",
				event: "stats_partial",
				message:
					"Some shards did not return statistics; the reply includes only responding shards.",
				context: {
					...summarizeStats(results),
					requestId: interaction.id,
					failedShards: failed.map((result) => ({
						shard: result.shard,
						code: result.error.code,
					})),
				},
				error: new AggregateError(failed.map((result) => result.error)),
			});
		await interaction.editReply(formatStats(results));
	}
}
