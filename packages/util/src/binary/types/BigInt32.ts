import type { IType } from "./base/IType";

/** Codec for a signed 32-bit bigint. */
export const BigInt32Type: IType<bigint, 32> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeBigInt32(value);
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readBigInt32(pointer);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 32,
};
