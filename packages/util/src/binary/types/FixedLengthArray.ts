import { isArrayLike } from "../shared/_common";
import type { IType } from "./base/IType";

/**
 * Create a codec for exactly the supplied number of elements, without a length prefix.
 * @param type - Element codec.
 * @param length - Required element count.
 * @returns A codec that rejects inputs of a different length. Element and buffer errors propagate.
 */
export function FixedLengthArrayType<
	ValueType,
	ValueBitSize extends number | null,
>(
	type: IType<ValueType, ValueBitSize>,
	length: number,
): IType<ValueType[], ValueBitSize extends null ? null : number> {
	return {
		serialize(buffer, values) {
			if (!isArrayLike(values) || values.length !== length) {
				throw new TypeError(
					`Expected array of length ${length}, got ${values.length}`,
				);
			}

			for (let i = 0; i < length; i++) {
				type.serialize(buffer, values[i]);
			}
		},
		deserialize(buffer, pointer) {
			const value = [];
			for (let i = 0; i < length; i++) {
				value.push(type.deserialize(buffer, pointer));
			}
			return value;
		},
		BIT_SIZE: (typeof type.BIT_SIZE === "number"
			? type.BIT_SIZE * length
			: null) as ValueBitSize extends null ? null : number,
	};
}
