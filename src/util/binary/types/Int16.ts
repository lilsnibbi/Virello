import type { IType } from "./base/IType";

/** Codec for a signed 16-bit integer. */
export const Int16Type: IType<number, 16> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeInt16(value);
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readInt16(pointer);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 16,
};
