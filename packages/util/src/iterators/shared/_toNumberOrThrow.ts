export function toNumberOrThrow(value: NumberResolvable): number {
	switch (typeof value) {
		case "bigint":
			throw new TypeError("Cannot convert a BigInt value to a number");
		case "symbol":
			throw new TypeError("Cannot convert a Symbol value to a number");
		case "boolean":
			return value ? 1 : 0;
		case "number":
			return assertNumber(value, value);
		case "undefined":
			throw new TypeError("Cannot convert an undefined value to a number");
		default:
			return assertNumber(Number(value), value);
	}
}

/** Number, boolean, null, or an object coercible to one. NaN, undefined, symbols, and bigint inputs are rejected by numeric helpers. */
export type NumberResolvable =
	| number
	| boolean
	| null
	| {
			/** Return a number, boolean, or null for numeric conversion. */
			valueOf(): number | boolean | null;
	  }
	| {
			/** Return a number, boolean, or null for numeric conversion. */
			[Symbol.toPrimitive](): number | boolean | null;
	  };

function assertNumber(value: number, original: unknown): number {
	if (Number.isNaN(value)) {
		throw new RangeError(`${original} must be a non-NaN number`);
	}

	return value;
}
