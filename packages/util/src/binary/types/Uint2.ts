import type { IType } from "./base/IType";

/** Codec for a unsigned 2-bit integer. */
export const Uint2Type: IType<number, 2> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeInt2(value);
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readUint2(pointer);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 2,
};
