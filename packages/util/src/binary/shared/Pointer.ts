import { isValidLength } from "./_common";

/** A pointer to a position in a buffer. */
export class Pointer {
	#value = 0;

	/** Current zero-based bit offset. New pointers start at 0. */
	public get value() {
		return this.#value;
	}

	/**
	 * Move the bit offset by a signed amount.
	 * @param value - Bits to add.
	 * @returns This pointer.
	 * @throws RangeError if the resulting offset is not an integer in 0..2147483647.
	 */
	public add(value: number) {
		const added = this.#value + value;
		if (!isValidLength(added)) {
			throw new RangeError(
				`The pointer value cannot be an invalid length value`,
			);
		}

		this.#value = added;
		return this;
	}

	/**
	 * Reuse a Pointer or create one from a numeric-coercible value.
	 * @param pointer - Existing pointer or value convertible to a valid bit offset.
	 * @returns The existing or newly initialized pointer.
	 * @throws If numeric conversion or offset validation fails.
	 */
	public static from(pointer: PointerLike) {
		if (pointer instanceof Pointer) {
			return pointer;
		}

		const instance = new Pointer();
		instance.add(Number(pointer));
		return instance;
	}
}

/** Pointer or numeric-coercible bit offset. Passing a Pointer lets reads advance the caller’s shared position. */
export type PointerLike =
	| Pointer
	| {
			/** Return the numeric bit offset. */
			valueOf(): number;
	  }
	| {
			/** Return the numeric bit offset for the number hint. */
			[Symbol.toPrimitive](hint: "number"): number;
	  };
