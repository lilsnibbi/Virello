import type { IType } from "./base/IType";

/** Codec for a signed 8-bit integer. */
export const Int8Type: IType<number, 8> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeInt8(value);
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readInt8(pointer);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 8,
};
