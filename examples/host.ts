import { ShardManager } from "virello/sharding";
import { integerEnv, requiredEnv } from "./config";
import { cleanupFailedStartup, exampleLogger, startupFailed } from "./logging";
import { onShutdown } from "./shutdown";

async function main(): Promise<void> {
	const id = Bun.env.SHARD_HOST_ID?.trim() || "local";
	const manager = new ShardManager({
		id,
		token: requiredEnv("SHARD_HOST_TOKEN"),
		url:
			Bun.env.SHARD_COORDINATOR_URL?.trim() || "ws://127.0.0.1:8080/sharding",
		script: new URL("./bot.ts", import.meta.url),
		cwd: import.meta.dir,
		env: { DISCORD_TOKEN: requiredEnv("DISCORD_TOKEN") },
		assignmentPollIntervalMs: integerEnv(
			"SHARD_ASSIGNMENT_POLL_MS",
			30000,
			50,
			300000,
		),
		maxDisconnectedLifetimeMs: integerEnv(
			"SHARD_MAX_DISCONNECTED_MS",
			900000,
			1,
			2147483647,
		),
		logger: exampleLogger,
	});
	let stopping = false;
	const detach = onShutdown(
		() => {
			stopping = true;
			return manager.close();
		},
		{ logger: exampleLogger, component: "host" },
	);
	try {
		await manager.start();
	} catch (error) {
		if (stopping) return;
		detach();
		await cleanupFailedStartup(() => manager.close(), "host");
		throw error;
	}
}

await main().catch((error) => startupFailed("host", error));
