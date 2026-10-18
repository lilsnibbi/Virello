import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
	ShardCoordinator,
	type ShardCoordinatorOptions,
	ShardManager,
	type ShardManagerOptions,
} from "../../src/index";

export const tokenA = "test-only-public-placeholder-host-A-0000";
export const tokenB = "test-only-public-placeholder-host-B-0000";
export const logger = { debug() {}, notif() {}, alert() {}, error() {} };
export const fixture = new URL("./fixtures/shard.ts", import.meta.url);
export const sessionLimit = {
	total: 100,
	remaining: 100,
	reset_after: 86400000,
	max_concurrency: 2,
};
export async function until(
	predicate: () => boolean | Promise<boolean>,
	ms = 10000,
): Promise<void> {
	const end = performance.now() + ms;
	while (!(await predicate())) {
		if (performance.now() > end)
			throw new Error("Condition did not become true.");
		await Bun.sleep(20);
	}
}
export async function stack(options: Partial<ShardCoordinatorOptions> = {}) {
	const folder = mkdtempSync(join(tmpdir(), "virello-shards-"));
	const base: ShardCoordinatorOptions = {
		shardCount: 2,
		workers: [
			{ id: "a", token: tokenA, shards: [0] },
			{ id: "b", token: tokenB, shards: [1] },
		],
		port: 0,
		sessionStartLimit: sessionLimit,
		logger,
		...options,
	};
	const coordinator = new ShardCoordinator(base);
	const managers: ShardManager[] = [];
	await coordinator.start();
	return {
		folder,
		base,
		coordinator,
		managers,
		async host(id: "a" | "b", extra: Partial<ShardManagerOptions> = {}) {
			const manager = new ShardManager({
				id,
				url: coordinator.url!,
				token: id === "a" ? tokenA : tokenB,
				script: fixture,
				logger,
				shutdownTimeoutMs: 500,
				startupTimeoutMs: 8000,
				restart: { initialDelayMs: 100, maxDelayMs: 500 },
				reconnect: { initialDelayMs: 100, maxDelayMs: 500 },
				...extra,
			});
			managers.push(manager);
			await manager.start();
			return manager;
		},
		async close() {
			await Promise.all(managers.map((m) => m.close()));
			await coordinator.close();
			const root = resolve(folder);
			if (!root.startsWith(resolve(tmpdir()) + sep))
				throw new Error("Unsafe fixture path.");
			rmSync(root, { recursive: true, force: true });
		},
	};
}
