import type { IType } from "./base/IType";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
/**
 * Codec for a UTF-8 string with a 16-bit byte-length prefix. Keep encoded UTF-8 text below 32768 bytes because decoding
 * reads a signed 16-bit length.
 */
export const StringType: IType<string, null> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		const encoded = encoder.encode(value);
		buffer.writeInt16(encoded.length);
		for (const byte of encoded) {
			buffer.writeInt8(byte);
		}
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, pointer) {
		const length = buffer.readInt16(pointer);
		const bytes = new Uint8Array(length);
		for (let i = 0; i < length; i++) {
			bytes[i] = buffer.readInt8(pointer);
		}
		return decoder.decode(bytes);
	},
	/** Variable encoded size, represented by null. */
	BIT_SIZE: null,
};
