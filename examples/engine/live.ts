import {
	GatewayIntentBits,
	InteractionResponseType,
} from "discord-api-types/v10";
import { EngineClient, logEvent } from "virello/engine";
import { requiredEnv } from "../config";
import { exampleLogger, startupFailed } from "../logging";
import { onShutdown } from "../shutdown";

async function main(): Promise<void> {
	if (!Bun.argv.includes("--live")) {
		logEvent(exampleLogger, "notif", {
			component: "engine",
			event: "live_disabled",
			message:
				"Live engine example is disabled; configure DISCORD_TOKEN, then pass --live to connect explicitly.",
		});
		return;
	}
	const client = new EngineClient({
		token: requiredEnv("DISCORD_TOKEN"),
		intents:
			GatewayIntentBits.Guilds |
			GatewayIntentBits.GuildMessages |
			GatewayIntentBits.MessageContent,
		onError: ({ source, fatal, error }) =>
			logEvent(exampleLogger, fatal ? "error" : "alert", {
				component: `engine.${source}`,
				event: "diagnostic",
				message: fatal
					? "Engine cannot continue after this failure; inspect the diagnostic cause before restarting."
					: "Engine reported a recoverable failure; inspect the diagnostic cause while recovery proceeds.",
				context: { fatal },
				error,
			}),
	});
	client.on("ready", () =>
		logEvent(exampleLogger, "notif", {
			component: "engine",
			event: "ready",
			message:
				"Engine gateway is ready; test !engine-ping in a channel where the bot can read and reply.",
		}),
	);
	client.on("messageCreate", async (message) => {
		if (!message.data.author.bot && message.data.content === "!engine-ping")
			await message.reply({
				content: "Pong from Virello engine.",
				allowed_mentions: { parse: [] },
			});
	});
	client.on("interactionCreate", async (interaction) => {
		if (
			interaction.data.type === 2 &&
			interaction.data.data.name === "engine-ping"
		)
			await interaction.respond({
				type: InteractionResponseType.ChannelMessageWithSource,
				data: {
					content: "Pong from Virello engine.",
					allowed_mentions: { parse: [] },
				},
			});
	});
	const detach = onShutdown(async () => client.close(), {
		logger: exampleLogger,
		component: "engine",
	});
	try {
		await client.connect();
	} catch (error) {
		detach();
		client.close();
		throw error;
	}
}

await main().catch((error) => startupFailed("engine", error));
