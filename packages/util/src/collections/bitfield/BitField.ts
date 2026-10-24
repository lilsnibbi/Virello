const FlagEntriesSymbol = Symbol("virello/bitfield.flags.entries");

/** Resolve and combine named positive bit masks using either 32-bit numbers or bigints. */
export class BitField<
	Flags extends Record<string, number> | Record<string, bigint>,
> {
	/** Numeric representation shared by every flag: number or bigint. */
	public readonly type: Flags[keyof Flags] extends number ? "number" : "bigint";
	/** Zero value in the flags’ numeric representation. */
	public readonly zero: Flags[keyof Flags] extends number ? 0 : 0n;
	/** Union of every configured flag bit. */
	public readonly mask: ValueType<this>;
	/** Original named flag object supplied to the constructor. */
	public readonly flags: Flags;
	private readonly [FlagEntriesSymbol]: readonly [string, Flags[keyof Flags]][];

	/**
	 * Create helpers for a set of named bit masks.
	 * @param flags - Nonempty map of positive values, all numbers or all bigints. Number flags must fit a signed 32-bit
	 * integer.
	 * @throws TypeError for mixed or unsupported values, or RangeError for nonpositive/out-of-range flags.
	 */
	public constructor(flags: Readonly<Flags>) {
		if (typeof flags !== "object" || flags === null) {
			throw new TypeError("flags must be a non-null object");
		}

		const entries = Object.entries(flags) as [string, Flags[keyof Flags]][];
		if (entries.length === 0) {
			throw new TypeError("flags must be a non-empty object");
		}

		const type = typeof entries[0][1];
		if (type !== "number" && type !== "bigint") {
			throw new TypeError(
				"A bitfield can only use numbers or bigints for its values",
			);
		}

		this.type = type as typeof this.type;
		this.flags = flags;
		this[FlagEntriesSymbol] = entries;

		if (type === "number") {
			this.zero = 0 as typeof this.zero;

			let mask = 0;
			for (const [key, value] of entries) {
				if (typeof value !== "number")
					throw new TypeError(
						`The property "${key}" does not resolve to a number`,
					);
				if (value !== (value | 0))
					throw new RangeError(
						`The property "${key}" does not resolve to a safe bitfield value`,
					);
				if (value <= 0)
					throw new RangeError(
						`The property "${key}" resolves to a non-positive value`,
					);
				mask |= value;
			}

			this.mask = mask as ValueType<this>;
		} else {
			this.zero = 0n as typeof this.zero;

			let mask = 0n;
			for (const [key, value] of entries) {
				if (typeof value !== "bigint")
					throw new TypeError(
						`The property "${key}" does not resolve to a bigint`,
					);
				if (value <= 0n)
					throw new RangeError(
						`The property "${key}" resolves to a non-positive value`,
					);
				mask |= value;
			}

			this.mask = mask as ValueType<this>;
		}
	}

	/** Resolve a: - `string`: If it's a property of {@link Flags}. - `number`: If the BitField processes `number` primitives. - `bigint`: If the BitField processes `bigint` primitives. - `Array`: Resolves recursively. */
	public resolve(resolvable: ValueResolvable<this>): ValueType<this> {
		switch (typeof resolvable) {
			case "string":
				if ((resolvable as string) in this.flags)
					return this.flags[
						resolvable as keyof Flags
					] as unknown as ValueType<this>;
				throw new RangeError(
					"Received a name that could not be resolved to a property of flags",
				);
			case this.type:
				return ((resolvable as ValueType<this>) & this.mask) as ValueType<this>;
			case "object":
				if (Array.isArray(resolvable))
					return resolvable.reduce(
						(acc, value) => this.resolve(value) | acc,
						this.zero,
					);
				throw new TypeError("Received an object value that is not an Array");
			default:
				throw new TypeError(
					`Received a value that is not either type "string", type "${this.type}", or an Array`,
				);
		}
	}

	/** Check whether `field` contains any of the bits from `bits`. */
	public any(
		field: ValueResolvable<this>,
		bits: ValueResolvable<this>,
	): boolean {
		return (this.resolve(field) & this.resolve(bits)) !== this.zero;
	}

	/** Check whether `field` is a superset of or equal to `bits`. */
	public has(
		field: ValueResolvable<this>,
		bits: ValueResolvable<this>,
	): boolean {
		const resolved = this.resolve(bits);
		return (this.resolve(field) & resolved) === resolved;
	}

	/** Makes the complement of `field`, which is a field of all bits (of `U` or the union of all {@link Flags} bits) that do not belong to `A`. It is the result of `U ∖ A`, or `difference(U, field)`. */
	public complement(field: ValueResolvable<this>): ValueType<this> {
		return this.difference(this.mask, field);
	}

	/** Makes a union of all the bits. */
	public union(...fields: readonly ValueResolvable<this>[]): ValueType<this> {
		let field = this.zero as ValueType<this>;
		for (const resolvable of fields) {
			field = (field | this.resolve(resolvable)) as ValueType<this>;
		}

		return field;
	}

	/** Makes an intersection of all the bits. */
	public intersection(
		bitfield: ValueResolvable<this>,
		...fields: readonly ValueResolvable<this>[]
	): ValueType<this> {
		let field = this.resolve(bitfield);
		for (const resolvable of fields) {
			field = (field & this.resolve(resolvable)) as ValueType<this>;
		}

		return field;
	}

	/** Removes from `a` the bits that exist in `b`. */
	public difference(
		a: ValueResolvable<this>,
		b: ValueResolvable<this>,
	): ValueType<this> {
		return (this.resolve(a) & ~this.resolve(b)) as ValueType<this>;
	}

	/** Calculate the symmetric difference, denoted as `A ⊖ B` or `A Δ B`, which is the disjunctive union, or the set of elements which are in either of the sets, but not in their intersection. */
	public symmetricDifference(
		a: ValueResolvable<this>,
		b: ValueResolvable<this>,
	): ValueType<this> {
		return (this.resolve(a) ^ this.resolve(b)) as ValueType<this>;
	}

	/** Get an array of the properties from {@link Flags} whose values are contained in `field`. */
	public toArray(field: ValueResolvable<this>): (keyof Flags)[] {
		return [...this.toKeys(field)];
	}

	/** Get an iterator of the properties from {@link Flags} whose values are contained in `field`. */
	public *toKeys(field: ValueResolvable<this>): IterableIterator<keyof Flags> {
		const bits = this.resolve(field);
		for (const [key, bit] of this[FlagEntriesSymbol]) {
			// Inline `.has` code for lower overhead:
			if ((bits & bit) === bit) yield key;
		}
	}

	/** Get an iterator of the values from {@link Flags} whose values are contained in `field`. */
	public *toValues(
		field: ValueResolvable<this>,
	): IterableIterator<ValueType<this>> {
		const bits = this.resolve(field);
		for (const [_, bit] of this[FlagEntriesSymbol]) {
			// Inline `.has` code for lower overhead:
			if ((bits & bit) === bit) yield bit as unknown as ValueType<this>;
		}
	}

	/** Get an iterator of the entries from {@link Flags} whose values are contained in `field`. */
	public *toEntries(
		field: ValueResolvable<this>,
	): IterableIterator<[key: keyof Flags, value: ValueType<this>]> {
		const bits = this.resolve(field);
		for (const [key, bit] of this[FlagEntriesSymbol]) {
			// Inline `.has` code for lower overhead:
			if ((bits & bit) === bit) yield [key, bit as unknown as ValueType<this>];
		}
	}

	/** Get an object with the properties from {@link Flags} whose values are boolean denoting whether the flag's bit is contained in `field`. */
	public toObject(field: ValueResolvable<this>): Record<keyof Flags, boolean> {
		const bits = this.resolve(field);
		return Object.fromEntries(
			this[FlagEntriesSymbol].map(([key, bit]) => [key, (bits & bit) === bit]),
		) as Record<keyof Flags, boolean>;
	}
}

/** Widen a numeric flag literal to number or bigint. */
export type PrimitiveType<T> = T extends number ? number : bigint;

/** One value or a readonly array of values. */
export type MaybeArray<T> = T | readonly T[];

/** Resolve the type of the values the specified {@link BitField} takes. @typeparam A {@link BitField} instance type. */
export type ValueType<T> =
	T extends BitField<infer Flags> ? PrimitiveType<Flags[keyof Flags]> : never;

/** Resolve the possible types accepted by the specified {@link BitField}. @typeparam A {@link BitField} instance type. */
export type ValueResolvable<T> =
	T extends BitField<infer Flags>
		? MaybeArray<keyof Flags | PrimitiveType<Flags[keyof Flags]>>
		: never;
