import type { IType } from "./base/IType";

/** Codec for a unsigned 64-bit bigint decoded from a bigint or string input. */
export const SnowflakeType: IType<bigint, 64, bigint | string> = {
	/** Append the encoded value to the buffer. The buffer’s capacity and conversion errors propagate. */
	serialize(buffer, value) {
		buffer.writeBigInt64(BigInt(value));
	},
	/** Read the encoded value at the supplied bit pointer and advance it. Malformed data errors propagate. */
	deserialize(buffer, offset) {
		return buffer.readBigUint64(offset);
	},
	/** Fixed number of bits used by this codec. */
	BIT_SIZE: 64,
};
