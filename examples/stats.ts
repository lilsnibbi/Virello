import type { ShardResult } from "virello/sharding";
import type { ExampleShardStats } from "./contracts";

/** Console diagnostics stay separate from the Discord reply copy below. */
export function summarizeStats(results: ShardResult<ExampleShardStats>[]) {
	const responding = results.filter((result) => result.ok);
	return {
		shards: results.length,
		responding: responding.length,
		unavailable: results.length - responding.length,
		ready: responding.filter((result) => result.value.ready).length,
		guilds: responding.reduce(
			(count, result) => count + result.value.guilds,
			0,
		),
		commands: [
			...new Set(responding.flatMap((result) => result.value.commands)),
		].sort(),
	};
}

export function formatStats(results: ShardResult<ExampleShardStats>[]): string {
	let guilds = 0;
	let responding = 0;
	for (const result of results) {
		if (result.ok) {
			guilds += result.value.guilds;
			responding++;
		}
	}
	const lines = results.slice(0, 10).map((result) => {
		if (!result.ok)
			return `Shard ${result.shard}: unavailable (${result.error.code})`;
		const stats = result.value;
		return `Shard ${stats.shard}: ${stats.ready ? "ready" : "not logged in"}, ${stats.guilds} servers, ${stats.memoryMb} MB, up ${stats.uptimeSeconds}s`;
	});
	if (results.length > 10)
		lines.push(`...plus ${results.length - 10} more shards.`);
	return [
		`${responding}/${results.length} shards responded; ${guilds} servers on responding shards.`,
		"",
		...lines,
	].join("\n");
}
