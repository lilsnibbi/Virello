import type { ApplicationCommand } from "discord.js";
import type { ApplicationCommandManager } from "discord.js";
import { writeEvent } from "../../../logging/diagnostics";
import { container } from "../../core/modules/index";

export async function getNeededRegistryParameters(
	guildIds: Set<string> = new Set(),
) {
	const { client } = container;

	const applicationCommands = client.application!.commands;
	const globalCommands = await applicationCommands.fetch({
		withLocalizations: true,
	});
	const guildCommands = await fetchGuildCommands(applicationCommands, guildIds);

	return {
		applicationCommands,
		globalCommands,
		guildCommands,
	};
}

async function fetchGuildCommands(
	commands: ApplicationCommandManager,
	guildIds: Set<string>,
) {
	const map = new Map<string, Map<string, ApplicationCommand>>();

	for (const guildId of guildIds) {
		try {
			const guildCommands = await commands.fetch({
				guildId,
				withLocalizations: true,
			});
			map.set(guildId, guildCommands);
		} catch (error) {
			const { preventFailedToFetchLogForGuilds } = container.client.options;

			if (preventFailedToFetchLogForGuilds === true) continue;

			if (
				Array.isArray(preventFailedToFetchLogForGuilds) &&
				!preventFailedToFetchLogForGuilds?.includes(guildId)
			) {
				writeEvent(container.logger, "alert", {
					component: "rest.registration",
					event: "guild_fetch_failed",
					message:
						"Could not read this guild's Discord commands; verify the application is installed with applications.commands access.",
					context: { guildId },
					error,
				});
			}
		}
	}

	return map;
}
