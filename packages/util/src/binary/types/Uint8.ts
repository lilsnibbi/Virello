import type { IType } from "./base/IType";

/** Codec for a unsigned 8-bit integer. */
export const Uint8Type: IType<number, 8> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeInt8(value);
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		return buffer.readUint8(pointer);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 8,
};
