import { ShardError } from "./types";

/** Route a Discord guild snowflake using the current total, without floating-point precision loss. */
export function calculateShardId(guildId: string, shardCount: number): number {
	if (
		typeof guildId !== "string" ||
		!/^[1-9]\d{0,19}$/.test(guildId) ||
		BigInt(guildId) > 0xffffffffffffffffn
	)
		throw new ShardError(
			"GUILD",
			"Guild ID must be a positive unsigned 64-bit snowflake.",
		);
	if (!Number.isInteger(shardCount) || shardCount < 1 || shardCount > 4096)
		throw new ShardError("TARGET", "Shard count must be 1..4096.");
	return Number((BigInt(guildId) >> 22n) % BigInt(shardCount));
}
