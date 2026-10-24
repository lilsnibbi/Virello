import "./contracts";
import { ShardManager } from "virello";

const manager = new ShardManager({
	id: process.env.SHARD_TEST_ID!,
	url: process.env.SHARD_TEST_URL!,
	token: process.env.SHARD_TEST_TOKEN!,
	script: new URL("./shard.ts", import.meta.url),
	logger: { debug() {}, notif() {}, alert() {}, error() {} },
	shutdownTimeoutMs: 300,
	restart: { initialDelayMs: 100, maxDelayMs: 500 },
	reconnect: { initialDelayMs: 100, maxDelayMs: 500 },
});
let closing = false;
async function close() {
	if (closing) return;
	closing = true;
	await manager.close();
	process.exit(0);
}
process.on("disconnect", () => {
	void close();
});
process.on("SIGTERM", () => {
	void close();
});
process.on("message", (input) => {
	const command = input as {
		id: string;
		op: "probe" | "relay" | "info" | "identity" | "close";
		shard: number;
		value: number;
	};
	void (async () => {
		if (command.op === "close") {
			await close();
			return;
		}
		try {
			const value =
				command.op === "identity"
					? manager["instance"]
					: command.op === "info"
						? manager.processes
						: command.op === "relay"
							? await manager.request(0, "relay", {
									target: 1,
									value: command.value,
								})
							: await manager.request(command.shard, "probe", {
									value: command.value,
								});
			process.send?.({ id: command.id, ok: true, value });
		} catch (error) {
			process.send?.({
				id: command.id,
				ok: false,
				message: error instanceof Error ? error.message : "failed",
			});
		}
	})();
});
await manager.start();
process.send?.({ id: "started", ok: true, value: null });
