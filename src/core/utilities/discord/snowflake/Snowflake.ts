const IncrementSymbol = Symbol("virello/snowflake.increment");
const EpochSymbol = Symbol("virello/snowflake.epoch");
const EpochNumberSymbol = Symbol("virello/snowflake.epoch.number");
const ProcessIdSymbol = Symbol("virello/snowflake.processId");
const WorkerIdSymbol = Symbol("virello/snowflake.workerId");

/** The maximum value the `workerId` field accepts in snowflakes. */
export const MaximumWorkerId = 0b11111n;

/** The maximum value the `processId` field accepts in snowflakes. */
export const MaximumProcessId = 0b11111n;

/** The maximum value the `increment` field accepts in snowflakes. */
export const MaximumIncrement = 0b111111111111n;

const TimestampFieldDivisor = 2 ** 22;

/** A class for generating and deconstructing Twitter snowflakes. */
export class Snowflake {
	/** Alias for {@link deconstruct} */
	public decode = this.deconstruct;

	/** Internal reference of the epoch passed in the constructor
	 * @internal */
	private readonly [EpochSymbol]: bigint;

	/** Internal reference of the epoch passed in the constructor as a number
	 * @internal */
	private readonly [EpochNumberSymbol]: number;

	/** Internal incrementor for generating snowflakes
	 * @internal */
	private [IncrementSymbol] = 0n;

	/** The process ID that will be used by default in the generate method
	 * @internal */
	private [ProcessIdSymbol] = 1n;

	/** The worker ID that will be used by default in the generate method
	 * @internal */
	private [WorkerIdSymbol] = 0n;

	/**
	 * Create a snowflake generator/parser for an epoch.
	 * @param epoch - Epoch in Unix milliseconds, as an integer number, bigint, or Date.
	 * @throws If the epoch cannot be converted to bigint.
	 */
	public constructor(epoch: number | bigint | Date) {
		this[EpochSymbol] = BigInt(epoch instanceof Date ? epoch.getTime() : epoch);
		this[EpochNumberSymbol] = Number(this[EpochSymbol]);
	}

	/** The epoch for this snowflake, as a bigint */
	public get epoch(): bigint {
		return this[EpochSymbol];
	}

	/** The epoch for this snowflake, as a number */
	public get epochNumber(): number {
		return this[EpochNumberSymbol];
	}

	/** Get the configured process ID */
	public get processId(): bigint {
		return this[ProcessIdSymbol];
	}

	/** Set the process ID that will be used by default for the {@link generate} method */
	public set processId(value: number | bigint) {
		this[ProcessIdSymbol] = BigInt(value) & MaximumProcessId;
	}

	/** Get the configured worker ID */
	public get workerId(): bigint {
		return this[WorkerIdSymbol];
	}

	/** Set the worker ID that will be used by default for the {@link generate} method */
	public set workerId(value: number | bigint) {
		this[WorkerIdSymbol] = BigInt(value) & MaximumWorkerId;
	}

	/**
	 * Pack timestamp, worker/process IDs, and increment into a bigint snowflake.
	 * @param options - Optional timestamp and field overrides. Timestamp defaults to Date.now().
	 * @returns The packed ID. Omitted increments advance the local counter; callers coordinate uniqueness across generators.
	 * @throws If timestamp conversion to bigint fails.
	 */
	public generate({
		increment,
		timestamp = Date.now(),
		workerId = this[WorkerIdSymbol],
		processId = this[ProcessIdSymbol],
	}: SnowflakeGenerateOptions = {}) {
		if (timestamp instanceof Date) timestamp = BigInt(timestamp.getTime());
		else if (typeof timestamp === "number") timestamp = BigInt(timestamp);
		else if (typeof timestamp !== "bigint") {
			throw new TypeError(
				`"timestamp" argument must be a number, bigint, or Date (received ${typeof timestamp})`,
			);
		}

		if (typeof increment !== "bigint") {
			increment = this[IncrementSymbol];
			this[IncrementSymbol] = (increment + 1n) & MaximumIncrement;
		}

		// timestamp, workerId, processId, increment
		return (
			((timestamp - this[EpochSymbol]) << 22n) |
			((workerId & MaximumWorkerId) << 17n) |
			((processId & MaximumProcessId) << 12n) |
			(increment & MaximumIncrement)
		);
	}

	/** Deconstructs a snowflake given a snowflake ID */
	public deconstruct(id: string | bigint): DeconstructedSnowflake {
		const bigIntId = BigInt(id);
		const epoch = this[EpochSymbol];
		return {
			id: bigIntId,
			timestamp: (bigIntId >> 22n) + epoch,
			workerId: (bigIntId >> 17n) & MaximumWorkerId,
			processId: (bigIntId >> 12n) & MaximumProcessId,
			increment: bigIntId & MaximumIncrement,
			epoch,
		};
	}

	/** Get the timestamp field's value from a snowflake. */
	public timestampFrom(id: string | bigint): number {
		return (
			Math.floor(Number(id) / TimestampFieldDivisor) + this[EpochNumberSymbol]
		);
	}

	/**
	 * Compare nonnegative canonical snowflake IDs. Two string operands compare by length, then lexically; mixed types convert
	 * to bigint.
	 * @param a - First ID.
	 * @param b - Second ID.
	 * @returns -1, 0, or 1 for ascending order.
	 */
	public static compare(a: string | bigint, b: string | bigint): -1 | 0 | 1 {
		const typeA = typeof a;
		return typeA === typeof b
			? typeA === "string"
				? cmpString(a as string, b as string)
				: cmpBigInt(a as bigint, b as bigint)
			: cmpBigInt(BigInt(a), BigInt(b));
	}
}

/** @internal */
function cmpBigInt(a: bigint, b: bigint) {
	return a === b ? 0 : a < b ? -1 : 1;
}

/** @internal */
function cmpString(a: string, b: string) {
	return a === b
		? 0
		: a.length < b.length
			? -1
			: a.length > b.length
				? 1
				: a < b
					? -1
					: 1;
}

/** Options for Snowflake#generate */
export interface SnowflakeGenerateOptions {
	/** Timestamp or date of the snowflake to generate
	 * @default Date.now() */
	timestamp?: number | bigint | Date;

	/** Explicit low 12 bits, or omit to use and advance the generator’s counter modulo 4096. */
	increment?: bigint;

	/** Worker ID, masked to five bits. Defaults to this generator’s configured workerId, initially 0n. */
	workerId?: bigint;

	/** Process ID, masked to five bits. Defaults to this generator’s configured processId, initially 1n. */
	processId?: bigint;
}

/** Object returned by Snowflake#deconstruct */
export interface DeconstructedSnowflake {
	/** The id in BigInt form */
	id: bigint;

	/** The timestamp stored in the snowflake */
	timestamp: bigint;

	/** The worker id stored in the snowflake */
	workerId: bigint;

	/** The process id stored in the snowflake */
	processId: bigint;

	/** The increment stored in the snowflake */
	increment: bigint;

	/** The epoch to use in the snowflake */
	epoch: bigint;
}
