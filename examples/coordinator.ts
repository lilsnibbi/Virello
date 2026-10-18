import { ShardCoordinator } from "virello/sharding";
import {
	ExampleConfigurationError,
	integerEnv,
	requiredEnv,
	scalingOptions,
	workerAssignments,
} from "./config";
import { cleanupFailedStartup, exampleLogger, startupFailed } from "./logging";
import { onShutdown } from "./shutdown";

async function main(): Promise<void> {
	const shardCount = integerEnv("SHARD_COUNT", 2, 1, 4096);
	const cert = Bun.env.SHARD_TLS_CERT?.trim();
	const key = Bun.env.SHARD_TLS_KEY?.trim();
	if (Boolean(cert) !== Boolean(key))
		throw new ExampleConfigurationError(
			"SHARD_TLS_CERT/SHARD_TLS_KEY",
			"Provide both SHARD_TLS_CERT and SHARD_TLS_KEY, or leave both unset.",
		);
	const coordinator = new ShardCoordinator({
		shardCount,
		workers: workerAssignments(shardCount),
		scaling: scalingOptions(),
		botToken: requiredEnv("DISCORD_TOKEN"),
		hostname: Bun.env.SHARD_COORDINATOR_HOST?.trim() || "127.0.0.1",
		port: integerEnv("SHARD_COORDINATOR_PORT", 8080, 0, 65535),
		tls: cert && key ? { cert: Bun.file(cert), key: Bun.file(key) } : undefined,
		// Host, shard and request activity is visible at info; debug adds frame metadata without payloads.
		logger: exampleLogger,
	});
	let stopping = false;
	const detach = onShutdown(
		() => {
			stopping = true;
			return coordinator.close();
		},
		{ logger: exampleLogger, component: "coordinator" },
	);
	try {
		await coordinator.start();
	} catch (error) {
		if (stopping) return;
		detach();
		await cleanupFailedStartup(() => coordinator.close(), "coordinator");
		throw error;
	}
}

await main().catch((error) => startupFailed("coordinator", error));
