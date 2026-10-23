import type { IType } from "./base/IType";

/** Codec for a 64-bit floating-point number. */
export const Float64Type: IType<number, 64> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeFloat64(value);
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readFloat64(pointer);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 64,
};
