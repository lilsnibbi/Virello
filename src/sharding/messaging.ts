import { statsMap, statsRequest, statsSnapshot } from "./stats";
import {
	type ShardCallOptions,
	ShardError,
	type ShardInput,
	type ShardOutput,
	type ShardRequestName,
	type ShardResult,
	type ShardStatsResult,
} from "./types";

/** Named request API shared by client.sharding and the host supervisor. */
export abstract class ShardMessenger {
	/** Configured total from the latest assignment; zero before a host receives one. */
	public abstract get shardCount(): number;
	/**
	 * Prepare coordinator availability and the remaining deadline before sending. The base implementation returns options
	 * unchanged.
	 * @param options - Call settings.
	 * @returns Settings for the outgoing operation.
	 */
	protected async prepare(
		options: ShardCallOptions,
	): Promise<ShardCallOptions> {
		return options;
	}
	/**
	 * Send a named request through the concrete transport.
	 * @param target - Target Discord shard ID.
	 * @param name - Registered request name.
	 * @param payload - Plain JSON input.
	 * @param options - Deadline and cancellation settings.
	 * @returns The remote handler’s output.
	 */
	protected abstract call(
		target: number,
		name: string,
		payload: unknown,
		options: ShardCallOptions,
	): Promise<unknown>;
	/**
	 * Ask one shard to run a registered handler. Even self requests travel through the coordinator and are never replayed.
	 * @param shard - Target Discord shard ID.
	 * @param name - Name declared in ShardRequests.
	 * @param payload - Plain JSON input matching the contract.
	 * @param options - Deadline, cancellation, and optional coordinator wait.
	 * @returns The handler’s JSON output.
	 * @throws For an unavailable connection or target, invalid payload, capacity limits, cancellation, timeout, or handler
	 * failure.
	 */
	public request<K extends ShardRequestName>(
		shard: number,
		name: K,
		payload: ShardInput<K>,
		options: ShardCallOptions = {},
	): Promise<ShardOutput<K>> {
		return this.call(shard, name, payload, options) as Promise<ShardOutput<K>>;
	}
	/**
	 * Request fresh live stats from one shard, or every configured ID when omitted. Self requests also use the coordinator.
	 * @param shardId - Optional target shard ID.
	 * @param options - One deadline for coordinator waiting and collection; at most eight requests run at once.
	 * @returns A read-only map of frozen samples or explicit per-shard errors. Cached scaling metrics are never used.
	 * @throws For invalid arguments or failed local connection preparation. Once collection starts, failures and cancellation
	 * become per-shard errors.
	 */
	public async stats(
		shardId?: number,
		options: ShardCallOptions = {},
	): Promise<ReadonlyMap<number, ShardStatsResult>> {
		options = await this.prepare(options);
		if (!this.shardCount)
			throw new ShardError("DISCONNECTED", "Sharding is not connected.");
		if (
			shardId !== undefined &&
			(!Number.isInteger(shardId) || shardId < 0 || shardId >= this.shardCount)
		)
			throw new ShardError("TARGET", "Shard is outside the configured range.");
		const targets =
			shardId === undefined
				? Array.from({ length: this.shardCount }, (_, shard) => shard)
				: [shardId];
		const deadline = performance.now() + (options.timeoutMs ?? 15000);
		const results: ShardStatsResult[] = new Array(targets.length);
		let next = 0;
		await Promise.all(
			Array.from({ length: Math.min(8, targets.length) }, async () => {
				while (next < targets.length) {
					const index = next++;
					const shard = targets[index];
					try {
						if (options.signal?.aborted)
							throw new ShardError("ABORTED", "Shard stats request aborted.");
						const remaining = Math.floor(deadline - performance.now());
						if (remaining <= 0)
							throw new ShardError("TIMEOUT", "Shard stats deadline elapsed.");
						const value = await this.call(shard, statsRequest, null, {
							...options,
							timeoutMs: remaining,
						});
						if (performance.now() >= deadline)
							throw new ShardError("TIMEOUT", "Shard stats deadline elapsed.");
						results[index] = Object.freeze({
							shard,
							ok: true,
							value: statsSnapshot(value),
						});
					} catch (cause) {
						const error = options.signal?.aborted
							? new ShardError("ABORTED", "Shard stats request aborted.")
							: cause instanceof ShardError
								? new ShardError(cause.code, cause.message)
								: new ShardError(
										"REQUEST",
										cause instanceof Error
											? cause.message
											: "Shard stats request failed.",
									);
						results[index] = Object.freeze({
							shard,
							ok: false,
							error: Object.freeze(error),
						});
					}
				}
			}),
		);
		return statsMap(results);
	}
	/**
	 * Request the same handler on every configured shard, including self, with at most eight requests at once.
	 * @param name - Name declared in ShardRequests.
	 * @param payload - Plain JSON input matching the contract.
	 * @param options - One deadline for waiting and collection. Sent requests are never replayed.
	 * @returns Results in shard ID order, with an explicit failure for every shard that cannot answer.
	 * @throws If the local coordinator connection cannot be prepared or the shard count is unknown.
	 */
	public async broadcast<K extends ShardRequestName>(
		name: K,
		payload: ShardInput<K>,
		options: ShardCallOptions = {},
	): Promise<ShardResult<ShardOutput<K>>[]> {
		options = await this.prepare(options);
		if (!this.shardCount)
			throw new ShardError("DISCONNECTED", "Sharding is not connected.");
		const deadline = performance.now() + (options.timeoutMs ?? 15000);
		const results: ShardResult<ShardOutput<K>>[] = new Array(this.shardCount);
		let next = 0;
		await Promise.all(
			Array.from({ length: Math.min(8, this.shardCount) }, async () => {
				while (next < results.length) {
					const shard = next++;
					try {
						const remaining = Math.floor(deadline - performance.now());
						if (remaining <= 0)
							throw new ShardError("TIMEOUT", "Broadcast deadline elapsed.");
						results[shard] = {
							shard,
							ok: true,
							value: await this.request(shard, name, payload, {
								...options,
								timeoutMs: remaining,
							}),
						};
					} catch (error) {
						results[shard] = {
							shard,
							ok: false,
							error:
								error instanceof ShardError
									? error
									: new ShardError(
											"REQUEST",
											error instanceof Error
												? error.message
												: "Request failed.",
										),
						};
					}
				}
			}),
		);
		return results;
	}
}
