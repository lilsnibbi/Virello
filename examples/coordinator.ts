import { ShardCoordinator } from "virello/sharding";
import { createInterface } from "node:readline";
import { logEvent } from "virello/engine";
import { type } from "virello/validation";
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
		applicationId: requiredEnv("DISCORD_APPLICATION_ID"),
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
	let input: ReturnType<typeof createInterface> | undefined;
	const detach = onShutdown(
		() => {
			stopping = true;
			input?.close();
			return coordinator.close();
		},
		{ logger: exampleLogger, component: "coordinator" },
	);
	try {
		await coordinator.start();
		const operationId = coordinator.status.coordinatorTerm!;
		logEvent(exampleLogger, "notif", {
			component: "coordinator",
			event: "recovery_required",
			message:
				"Stop or fence every prior host tree and review outstanding effects. Then submit the recovery JSON on stdin; see examples/README.md.",
			context: {
				operationId,
				hosts: coordinator.workers.map((host) => host.id),
			},
		});
		input = createInterface({ input: process.stdin, terminal: false });
		input.on("line", (line) => {
			void (async () => {
				if (line.length > 8192)
					throw new Error("Recovery input exceeds 8192 characters.");
				const evidence = type({
					operationId: "string",
					hosts: "string[]",
					evidence: "string",
					"+": "reject",
				}).assert(JSON.parse(line));
				if (evidence.operationId !== operationId)
					throw new Error("Use this coordinator incarnation's operationId.");
				await coordinator.confirmFleetStopped(evidence);
				logEvent(exampleLogger, "notif", {
					component: "coordinator",
					event: "recovery_confirmed",
					message: "Reviewed recovery complete; fresh assignments may start.",
				});
			})().catch((error) =>
				logEvent(exampleLogger, "alert", {
					component: "coordinator",
					event: "recovery_rejected",
					message:
						"Recovery was not confirmed. Inspect the evidence and current status.",
					error,
				}),
			);
		});
	} catch (error) {
		if (stopping) return;
		detach();
		await cleanupFailedStartup(() => coordinator.close(), "coordinator");
		throw error;
	}
}

await main().catch((error) => startupFailed("coordinator", error));
