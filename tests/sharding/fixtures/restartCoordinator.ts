// Isolated coordinator process: all Discord metadata is synthetic; no external requests are made.
import { ShardCoordinator } from "../../../src/sharding/coordinator/Coordinator";
import { logger, tokenA } from "../helpers";

const started = performance.now();
const sessionStartLimit = {
	total: 10,
	remaining: Number(Bun.argv[4]),
	reset_after: 60000,
	max_concurrency: 1,
};
const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
	async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
		if (String(input) !== "https://discord.com/api/v10/gateway/bot")
			throw new Error("Unexpected fixture HTTP request.");
		process.send?.({ event: "metadata", elapsed: performance.now() - started });
		return Response.json({ session_start_limit: sessionStartLimit });
	},
	originalFetch,
);
// Deliberately retain obsolete untyped configuration: it must not open or modify legacy files.
const options = {
	shardCount: 1,
	workers: [{ id: "a", token: tokenA, shards: [0] }],
	port: Number(Bun.argv[2]),
	statePath: Bun.argv[3],
	botToken: Bun.argv[5] === "manual" ? undefined : "offline-test-placeholder",
	sessionStartLimit: Bun.argv[5] === "manual" ? sessionStartLimit : undefined,
	logger,
};
const coordinator = new ShardCoordinator(options);
process.on("disconnect", () => void coordinator.close());
process.on("message", (input) => {
	if ((input as { op?: string }).op === "close")
		void coordinator.close().then(() => {
			process.disconnect?.();
			process.exit(0);
		});
});
await coordinator.start();
process.send?.({ event: "ready", url: coordinator.url });
