import { RateLimit } from "./RateLimit";

/** Named fixed-window rate-limit buckets, with an unref’ed timer that removes expired buckets. */
export class RateLimitManager<K = string> extends Map<K, RateLimit<K>> {
	/** The number of milliseconds for the {@link RateLimit ratelimits} from this manager to expire. */
	public readonly time: number;

	/** The number of times a {@link RateLimit} can drip before it's limited. */
	public readonly limit: number;

	/** The interval to sweep expired {@link RateLimit ratelimits}. */
	private sweepInterval!: NodeJS.Timeout | undefined | null;

	/**
	 * Create a bucket manager without starting a sweep timer yet.
	 * @param time - Reset interval in milliseconds.
	 * @param limit - Uses per bucket; defaults to 1.
	 */
	public constructor(time: number, limit = 1) {
		super();

		this.time = time;
		this.limit = limit;
	}

	/** Get a {@link RateLimit} from this manager or creates it if it does not exist. */
	public acquire(id: K): RateLimit<K> {
		return this.get(id) ?? this.create(id);
	}

	/** Create a {@link RateLimit} for this manager. */
	public create(id: K): RateLimit<K> {
		const value = new RateLimit(this);
		this.set(id, value);
		return value;
	}

	/** Wraps Collection's set method to set interval to sweep inactive {@link RateLimit}s. */
	public override set(id: K, value: RateLimit<K>): this {
		this.sweepInterval ??= setInterval(
			this.sweep.bind(this),
			RateLimitManager.sweepIntervalDuration,
		).unref();
		return super.set(id, value);
	}

	/**
	 * Remove a bucket and stop the sweep timer if the map becomes empty.
	 * @param id - Bucket key.
	 * @returns Whether a bucket existed.
	 */
	public override delete(id: K): boolean {
		const deleted = super.delete(id);
		this.clearEmptyInterval();
		return deleted;
	}

	/** Remove all buckets and stop the sweep timer. */
	public override clear(): void {
		super.clear();
		this.clearEmptyInterval();
	}

	/** Wraps Collection's sweep method to clear the interval when this manager is empty. */
	public sweep(): void {
		for (const [id, value] of this.entries()) {
			if (value.expired) this.delete(id);
		}
		this.clearEmptyInterval();
	}

	private clearEmptyInterval(): void {
		if (
			this.size === 0 &&
			this.sweepInterval !== undefined &&
			this.sweepInterval !== null
		) {
			clearInterval(this.sweepInterval);
			this.sweepInterval = null;
		}
	}

	/** The delay in milliseconds for {@link RateLimitManager.sweepInterval}. */
	public static sweepIntervalDuration = 30_000;
}
