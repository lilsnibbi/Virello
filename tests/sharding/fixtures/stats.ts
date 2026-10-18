import "./contracts";
import { container, VirelloClient } from "virello";
import type { StatsReply } from "./contracts";

const client = new VirelloClient({
	intents: [],
	logger: { debug() {}, notif() {}, alert() {}, error() {} },
});
let ready = false;
let samples = 0;
let delayMs = 0;
let invalid = false;
Reflect.set(client, "isReady", () => ready);
const sample = client.sharding["statistics"]!;
// Only the on-demand sampler is slowed/corrupted. Heartbeat metrics keep their normal behavior.
Reflect.set(client.sharding, "statistics", () => {
	samples++;
	const until = performance.now() + delayMs;
	while (performance.now() < until) {
		/* Simulate a shard event loop that can't answer before the caller's deadline. */
	}
	const value = sample();
	return invalid ? { ...value, memory: { ...value.memory, rss: -1 } } : value;
});
client.sharding.handle("statsSamples", () => samples);
client.sharding.handle("statsUpdate", (input) => {
	ready = input.ready;
	delayMs = input.delayMs ?? 0;
	invalid = input.invalid ?? false;
	client.cache.guilds.clear();
	for (let index = 0; index < input.guilds; index++)
		client.cache.guilds.patch(String(index), { id: String(index) });
	return null;
});
client.sharding.handle("statsRead", async ({ shard }) => {
	const stats = await container.sharding.stats(shard ?? undefined);
	return [...stats].map(([id, result]): [number, StatsReply] => [
		id,
		result.ok
			? result
			: {
					shard: id,
					ok: false,
					error: { code: result.error.code, message: result.error.message },
				},
	]);
});
await client.sharding.connect();
