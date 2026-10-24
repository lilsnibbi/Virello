import type { IType } from "./base/IType";

/** Codec for a one-bit boolean. */
export const BooleanType: IType<boolean, 1> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeBit(Number(value));
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readBit(pointer) === 1;
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 1,
};
