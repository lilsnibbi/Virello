// Modified identify scheduling design from discord-sharding. Apache-2.0; see ../LICENSE.
import { type } from "arktype";
import { ShardError, type ShardSessionLimit } from "../types";

const limitSchema = type({
	total: "number.integer > 0",
	remaining: "number.integer >= 0",
	reset_after: "number.integer >= 0",
	max_concurrency: "number.integer > 0",
	"+": "reject",
});
export const identifyCooldownMs = 5500;
interface Bucket {
	until: number;
	connection?: string;
	shard?: number;
	generation?: string;
}

/** One running coordinator's allowance only. A new coordinator needs fresh Discord metadata. */
export class IdentifyScheduler {
	private budget?: ShardSessionLimit;
	private deadline = 0;
	private readonly startupDeadline: number;
	private readonly buckets = new Map<number, Bucket>();
	public constructor(
		private readonly now: () => number = () => performance.now(),
	) {
		// A restart has forgotten the preceding process's short identify cooldowns.
		this.startupDeadline = this.now() + identifyCooldownMs;
	}
	public update(value: ShardSessionLimit): void {
		limitSchema.assert(value);
		if (
			value.remaining > value.total ||
			value.total > 1000000 ||
			value.max_concurrency > 4096 ||
			value.reset_after > 604800000
		)
			throw new TypeError("Invalid Discord session-start limit.");
		const now = this.now();
		const old = this.budget;
		const unexpired = !!old && now < this.deadline;
		if (
			old &&
			old.max_concurrency !== value.max_concurrency &&
			(unexpired ||
				[...this.buckets.values()].some(
					(bucket) => bucket.connection || bucket.until > now,
				))
		)
			throw new ShardError(
				"SESSION_LIMIT",
				"max_concurrency changed while the previous session window or identify buckets are active.",
			);
		this.budget = {
			...value,
			remaining: unexpired
				? Math.min(old!.remaining, value.remaining)
				: value.remaining,
		};
		// Zero reset intervals still require a fresh snapshot; time alone never refills allowance.
		this.deadline =
			now +
			Math.max(value.reset_after || 60000, unexpired ? this.deadline - now : 0);
	}
	public get expired(): boolean {
		return !this.budget || this.now() >= this.deadline;
	}
	public get remaining(): number {
		return this.expired ? 0 : this.budget!.remaining;
	}
	public grant(connection: string, shard: number, generation: string): boolean {
		const budget = this.budget;
		const now = this.now();
		if (
			!budget ||
			this.expired ||
			budget.remaining <= 0 ||
			now < this.startupDeadline
		)
			return false;
		const key = shard % budget.max_concurrency;
		const bucket = this.buckets.get(key);
		if (bucket && (bucket.connection || bucket.until > now)) return false;
		budget.remaining--;
		this.buckets.set(key, {
			until: now + identifyCooldownMs,
			connection,
			shard,
			generation,
		});
		return true;
	}
	/** READY, child exit, retry or disconnect ends an in-flight attempt without refunding allowance. */
	public stopped(
		connection: string,
		shard?: number,
		generation?: string,
	): void {
		for (const [key, bucket] of this.buckets) {
			if (
				bucket.connection !== connection ||
				(shard !== undefined &&
					(bucket.shard !== shard || bucket.generation !== generation))
			)
				continue;
			this.buckets.set(key, { until: this.now() + identifyCooldownMs });
		}
	}
}
