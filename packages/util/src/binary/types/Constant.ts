import type { IType } from "./base/IType";

/**
 * Create a zero-bit codec that always decodes to the supplied value. Serialization ignores input.
 * @param constantValue - Value returned unchanged by deserialize.
 * @returns A constant codec.
 */
export function ConstantType<const ValueType>(
	constantValue: ValueType,
): IType<ValueType, 0, never> {
	return {
		serialize(_buffer, _value) {},
		deserialize(_buffer, _pointer) {
			return constantValue;
		},
		BIT_SIZE: 0,
	};
}
