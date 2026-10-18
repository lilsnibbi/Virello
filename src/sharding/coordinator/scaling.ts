import { type } from "arktype";
import { ShardError, type ShardHost, type ShardScalingOptions } from "../types";

export interface ScalingPlan {
	count: number;
	assignments: Map<number, string>;
	reason: string;
}
export class ScalingPolicy {
	public readonly options: Required<ShardScalingOptions>;
	private candidate = "";
	private observations = 0;
	private changedAt = -Infinity;
	public constructor(
		options: ShardScalingOptions,
		private readonly now = () => performance.now(),
	) {
		this.options = {
			minShards: 1,
			targetGuildsPerShard: 0,
			pollIntervalMs: 300000,
			cooldownMs: 1800000,
			confirmations: 3,
			allowDownscale: true,
			rebalanceThreshold: 0.25,
			sessionReserve: 0,
			drainTimeoutMs: 30000,
			readyTimeoutMs: 300000,
			...options,
		};
		type({
			minShards: "number.integer >= 1 & number <= 4096",
			maxShards: "number.integer >= 1 & number <= 4096",
			targetGuildsPerShard: "number.integer >= 0 & number <= 2500",
			pollIntervalMs: "number.integer >= 60000 & number <= 86400000",
			cooldownMs: "number.integer >= 60000 & number <= 604800000",
			confirmations: "number.integer >= 1 & number <= 100",
			allowDownscale: "boolean",
			rebalanceThreshold: "number >= 0.05 & number <= 1",
			sessionReserve: "number.integer >= 0 & number <= 1000000",
			drainTimeoutMs: "number.integer >= 100 & number <= 300000",
			readyTimeoutMs: "number.integer >= 100 & number <= 3600000",
			"+": "reject",
		}).assert(this.options);
		if (this.options.minShards > this.options.maxShards)
			throw new TypeError("scaling.minShards exceeds maxShards.");
	}
	public plan(
		recommended: number,
		hosts: readonly ShardHost[],
		current: ReadonlyMap<number, string>,
		guilds?: ReadonlyMap<number, number>,
	): ScalingPlan {
		if (!Number.isInteger(recommended) || recommended < 1 || recommended > 4096)
			throw new ShardError(
				"SCALING_METADATA",
				"Discord returned an invalid recommended shard count.",
			);
		const capacity = Math.min(
			this.options.maxShards,
			hosts.reduce((sum, host) => sum + host.maxShards!, 0),
		);
		// A multiple of the recommendation also respects Discord's large-bot shard-count multiple.
		const ceiling = Math.floor(capacity / recommended) * recommended;
		if (ceiling < Math.max(this.options.minShards, recommended))
			throw new ShardError(
				"SCALING_CAPACITY",
				"Configured host capacity or maxShards cannot fit Discord recommendation and minShards.",
			);
		const totalGuilds = guilds
			? [...guilds.values()].reduce((sum, count) => sum + count, 0)
			: 0;
		const target = this.options.targetGuildsPerShard
			? Math.ceil(totalGuilds / this.options.targetGuildsPerShard)
			: 0;
		const desired =
			Math.ceil(
				Math.max(this.options.minShards, recommended, target) / recommended,
			) * recommended;
		let count = Math.min(desired, ceiling);
		if (!this.options.allowDownscale)
			count = Math.max(
				count,
				Math.ceil(current.size / recommended) * recommended,
			);
		if (count > capacity)
			throw new ShardError(
				"SCALING_CAPACITY",
				"Current shard count exceeds configured capacity.",
			);
		const loads = new Map(hosts.map((host) => [host.id, 0]));
		const sizes = new Map(hosts.map((host) => [host.id, 0]));
		const weight = (shard: number) =>
			Math.max(
				1,
				count === current.size && guilds
					? (guilds.get(shard) ?? 0)
					: Math.ceil(totalGuilds / count),
			);
		const assignments = new Map<number, string>();
		const shards = Array.from({ length: count }, (_, shard) => shard).sort(
			(a, b) => weight(b) - weight(a) || a - b,
		);
		for (const shard of shards) {
			const candidates = hosts.filter(
				(host) => sizes.get(host.id)! < host.maxShards!,
			);
			candidates.sort(
				(a, b) =>
					(loads.get(a.id)! + weight(shard)) / (a.weight ?? 1) -
						(loads.get(b.id)! + weight(shard)) / (b.weight ?? 1) ||
					Number(current.get(shard) === b.id) -
						Number(current.get(shard) === a.id) ||
					a.id.localeCompare(b.id),
			);
			const host = candidates[0];
			if (!host)
				throw new ShardError(
					"SCALING_CAPACITY",
					"No configured host can accept the proposed shard.",
				);
			assignments.set(shard, host.id);
			loads.set(host.id, loads.get(host.id)! + weight(shard));
			sizes.set(host.id, sizes.get(host.id)! + 1);
		}
		if (count === current.size) {
			const oldLoads = new Map(hosts.map((host) => [host.id, 0]));
			for (const [shard, host] of current)
				oldLoads.set(host, (oldLoads.get(host) ?? 0) + weight(shard));
			const peak = Math.max(
				...hosts.map((host) => oldLoads.get(host.id)! / (host.weight ?? 1)),
			);
			const nextPeak = Math.max(
				...hosts.map((host) => loads.get(host.id)! / (host.weight ?? 1)),
			);
			if (!peak || (peak - nextPeak) / peak < this.options.rebalanceThreshold)
				return { count, assignments: new Map(current), reason: "stable" };
		}
		return {
			count,
			assignments,
			reason:
				desired > ceiling
					? "capacity_limited"
					: count === current.size
						? "host_load"
						: "shard_count",
		};
	}
	public observe(
		plan: ScalingPlan,
		current: ReadonlyMap<number, string>,
	): "stable" | "cooldown" | "confirming" | "change" {
		if (
			plan.count === current.size &&
			[...plan.assignments].every(
				([shard, host]) => current.get(shard) === host,
			)
		) {
			this.reset();
			return "stable";
		}
		if (this.now() - this.changedAt < this.options.cooldownMs) {
			this.reset();
			return "cooldown";
		}
		const signature = JSON.stringify(
			[...plan.assignments].sort((a, b) => a[0] - b[0]),
		);
		if (signature !== this.candidate) {
			this.candidate = signature;
			this.observations = 0;
		}
		return ++this.observations >= this.options.confirmations
			? "change"
			: "confirming";
	}
	public changed(): void {
		this.changedAt = this.now();
		this.reset();
	}
	public reset(): void {
		this.candidate = "";
		this.observations = 0;
	}
}
