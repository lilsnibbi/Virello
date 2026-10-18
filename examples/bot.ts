import { logEvent } from "virello/client";
import { createBot } from "./client";
import { ExampleConfigurationError, requiredEnv } from "./config";
import { cleanupFailedStartup, exampleLogger, startupFailed } from "./logging";
import { onShutdown } from "./shutdown";

async function main(): Promise<void> {
	const offline = process.argv.includes("--offline");
	const token = offline ? undefined : requiredEnv("DISCORD_TOKEN");
	const client = createBot();
	const detach = onShutdown(() => client.destroy(), {
		logger: client.logger,
		component: "bot",
	});
	try {
		if (!client.sharding.enabled)
			throw new ExampleConfigurationError(
				"VIRELLO_SHARD",
				"Start examples/host.ts; the host launches one bot process per assigned shard.",
			);
		if (offline) {
			await client.load();
			await client.sharding.connect();
			logEvent(client.logger, "notif", {
				component: "bot",
				event: "offline_ready",
				message:
					"Offline shard is ready for module and RPC checks; Discord login is disabled.",
				context: {
					shard: client.sharding.id,
					commands: client.modules.require("commands").size,
				},
			});
		} else await client.login(token);
	} catch (error) {
		detach();
		await cleanupFailedStartup(() => client.destroy(), "bot", client.logger);
		throw error;
	}
}

await main().catch((error) => startupFailed("bot", error, exampleLogger));
