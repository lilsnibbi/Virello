import type { IType } from "./base/IType";

/** Codec for a one-bit numeric value. */
export const BitType: IType<0 | 1, 1, number> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeBit(value & 0b1);
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readBit(pointer);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 1,
};
