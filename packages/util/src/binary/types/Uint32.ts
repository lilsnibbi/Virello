import type { IType } from "./base/IType";

/** Codec for a unsigned 32-bit integer. */
export const Uint32Type: IType<number, 32> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeInt32(value);
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readUint32(pointer);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 32,
};
