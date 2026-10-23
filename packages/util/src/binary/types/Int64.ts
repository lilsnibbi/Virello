import type { IType } from "./base/IType";

/** Codec for a signed 64-bit number. Number values outside the safe integer range can lose precision. */
export const Int64Type: IType<number, 64> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeInt64(value);
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readInt64(pointer);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 64,
};
