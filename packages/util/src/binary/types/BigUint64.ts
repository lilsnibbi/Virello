import type { IType } from "./base/IType";

/** Codec for a unsigned 64-bit bigint. */
export const BigUint64Type: IType<bigint, 64> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeBigInt64(value);
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readBigUint64(pointer);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 64,
};
