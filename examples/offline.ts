import "./contracts";
import { logEvent } from "virello/client";
import { ShardCoordinator, ShardManager } from "virello/sharding";
import { exampleLogger } from "./logging";
import { summarizeStats } from "./stats";

async function main(): Promise<void> {
	const managers: ShardManager[] = [];
	// Disposable loopback-only secret. Nothing here contacts Discord.
	const token = crypto.randomUUID() + crypto.randomUUID();
	const coordinator = new ShardCoordinator({
		development: true,
		shardCount: 2,
		port: 0,
		workers: [{ id: "local", token, shards: [0, 1] }],
		sessionStartLimit: {
			total: 10,
			remaining: 10,
			reset_after: 60000,
			max_concurrency: 1,
		},
		logger: exampleLogger,
	});

	try {
		await coordinator.start();
		const manager = new ShardManager({
			id: "local",
			token,
			url: coordinator.url!,
			script: new URL("./bot.ts", import.meta.url),
			args: ["--offline"],
			env: { DEV_GUILD_ID: "", DISCORD_TOKEN: undefined },
			restart: false,
			logger: exampleLogger,
		});
		managers.push(manager);
		await manager.start();
		const deadline = performance.now() + 15000;
		while (coordinator.workers[0].shards.length !== 2) {
			if (performance.now() >= deadline)
				throw new Error(
					"Example shards did not start. Check the child process logs.",
				);
			await Bun.sleep(25);
		}
		// The coordinator can report readiness before the host receives its reply.
		const results = await manager.broadcast("exampleStats", null, {
			waitForCoordinator: true,
			timeoutMs: 5000,
		});
		for (const result of results) {
			if (!result.ok) throw result.error;
			if (result.value.commands.join(",") !== "ping,shard,stats")
				throw new Error(
					`Shard ${result.shard} did not load all three commands.`,
				);
			if (result.value.ready)
				throw new Error("Offline validation unexpectedly logged into Discord.");
		}
		const pids = new Set(
			results.filter((result) => result.ok).map((result) => result.value.pid),
		);
		if (pids.size !== 2)
			throw new Error(
				"Offline validation requires two distinct bot processes.",
			);
		const shard = await manager.request(1, "exampleStats", null);
		if (shard.shard !== 1)
			throw new Error("The single-shard request reached the wrong shard.");
		logEvent(exampleLogger, "notif", {
			component: "validation",
			event: "offline_passed",
			message:
				"Offline shard checks passed: both shards loaded all commands and answered broadcast and direct requests.",
			context: summarizeStats(results),
		});
	} finally {
		try {
			await Promise.all(managers.map((manager) => manager.close()));
		} finally {
			await coordinator.close();
		}
	}
}

await main().catch((error) => {
	logEvent(exampleLogger, "error", {
		component: "validation",
		event: "offline_failed",
		message:
			"Offline shard validation failed; inspect module loading, RPC routing and child-process diagnostics.",
		error,
	});
	process.exitCode = 1;
});
