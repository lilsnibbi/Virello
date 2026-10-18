import { type } from "arktype";
import type { VirelloClient as Client } from "../core/client/VirelloClient";
import { ShardError, type ShardStats, type ShardStatsResult } from "./types";

// Internal RPC uses the usual coordinator routing, ownership checks and request limits.
export const statsRequest = "virello:stats";
const nonnegative = type("number >= 0");
const count = type("number.integer >= 0");
const schema = type({
	sampledAt: count,
	ready: "boolean",
	guilds: count,
	users: count,
	channels: count,
	pingMs: nonnegative.or("null"),
	uptimeMs: nonnegative.or("null"),
	pid: "number.integer > 0",
	processUptimeMs: nonnegative,
	memory: {
		rss: count,
		heapTotal: count,
		heapUsed: count,
		external: count,
		arrayBuffers: count,
		"+": "reject",
	},
	"+": "reject",
});

export function sampleStats(client: Client): ShardStats {
	const ready = client.isReady();
	const ping = client.ping;
	const uptime = client.uptime;
	const users = new Set<string>();
	if (client.user) users.add(client.user.id);
	for (const scope of client.cache.members.scopeIds())
		for (const entry of client.cache.members.values(scope))
			if (entry.data.user?.id) users.add(entry.data.user.id);
	for (const scope of client.cache.messages.scopeIds())
		for (const entry of client.cache.messages.values(scope))
			if (entry.data.author?.id) users.add(entry.data.author.id);
	for (const entry of client.cache.channels.values())
		if ("recipients" in entry.data)
			for (const user of entry.data.recipients ?? [])
				if (user.id) users.add(user.id);
	return {
		sampledAt: Date.now(),
		ready,
		guilds: client.cache.guilds.size,
		users: users.size,
		channels: client.cache.channels.size,
		pingMs: ping !== null && Number.isFinite(ping) && ping >= 0 ? ping : null,
		uptimeMs:
			ready && uptime !== null && Number.isFinite(uptime) && uptime >= 0
				? uptime
				: null,
		pid: process.pid,
		processUptimeMs: process.uptime() * 1000,
		memory: process.memoryUsage(),
	};
}

export function statsSnapshot(value: unknown): ShardStats {
	const parsed = schema(value);
	if (parsed instanceof type.errors)
		throw new ShardError(
			"PROTOCOL",
			"Shard returned an invalid statistics sample.",
		);
	return Object.freeze({
		...parsed,
		memory: Object.freeze({ ...parsed.memory }),
	});
}

/** A frozen Map alone still has working mutators. Keep the backing Map private, including in forEach. */
export function statsMap(
	results: readonly ShardStatsResult[],
): ReadonlyMap<number, ShardStatsResult> {
	const entries = new Map(results.map((result) => [result.shard, result]));
	const view: ReadonlyMap<number, ShardStatsResult> = Object.freeze({
		get size() {
			return entries.size;
		},
		get: (shard: number) => entries.get(shard),
		has: (shard: number) => entries.has(shard),
		keys: () => entries.keys(),
		values: () => entries.values(),
		entries: () => entries.entries(),
		[Symbol.iterator]: () => entries[Symbol.iterator](),
		forEach(
			callback: (
				value: ShardStatsResult,
				key: number,
				map: ReadonlyMap<number, ShardStatsResult>,
			) => void,
			thisArg?: unknown,
		) {
			entries.forEach((value, key) => callback.call(thisArg, value, key, view));
		},
	});
	return view;
}
