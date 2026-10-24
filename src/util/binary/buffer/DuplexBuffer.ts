import type { PointerLike } from "../shared/Pointer";

/** Bit-oriented buffer backed by 16-bit words. Reads use bit offsets; numeric values are packed low bits first. */
export interface DuplexBuffer {
	/**
	 * Read a backing 16-bit word by index. Negative indices count from the backing array’s end.
	 * @param index - Word index.
	 * @returns The word, or undefined outside the backing array.
	 */
	at(index: number): number | undefined;

	/** Capacity in 16-bit words. */
	get maxLength(): number;
	/** Capacity in bits. */
	get maxBitLength(): number;
	/** Number of words touched by writes, including a partially written final word. */
	get length(): number;
	/** Number of bits written, or the encoded length assigned when loading a string. */
	get bitLength(): number;

	/**
	 * Append one bit: zero for a falsy value, one for a truthy value.
	 * @param value - Bit value.
	 * @throws RangeError when the buffer is full.
	 */
	writeBit(value: number): void;
	/**
	 * Append a 2-bit integer’s low 2 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	writeInt2(value: number): void;
	/**
	 * Append a 4-bit integer’s low 4 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	writeInt4(value: number): void;
	/**
	 * Append a 8-bit integer’s low 8 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	writeInt8(value: number): void;
	/**
	 * Append a 16-bit integer’s low 16 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	writeInt16(value: number): void;
	/**
	 * Append a 32-bit integer’s low 32 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	writeInt32(value: number): void;
	/**
	 * Append a 64-bit integer’s low 64 bits.
	 * @param value - Value to encode. Integer inputs must be accepted by BigInt().
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	writeInt64(value: number): void;
	/**
	 * Append a 32-bit integer’s low 32 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	writeBigInt32(value: bigint): void;
	/**
	 * Append a 64-bit integer’s low 64 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	writeBigInt64(value: bigint): void;
	/**
	 * Append a 32-bit IEEE floating-point value.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	writeFloat32(value: number): void;
	/**
	 * Append a 64-bit IEEE floating-point value.
	 * @param value - Value to encode. Integer inputs must be accepted by BigInt().
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	writeFloat64(value: number): void;

	/**
	 * Read one bit and advance a supplied Pointer by one.
	 * @param offset - Bit offset or shared pointer.
	 * @returns 0 or 1. Reads do not check the written-length boundary.
	 */
	readBit(offset: PointerLike): 0 | 1;
	/**
	 * Read a 2-bit signed integer and advance a supplied Pointer by 2 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readInt2(offset: PointerLike): number;
	/**
	 * Read a 2-bit unsigned integer and advance a supplied Pointer by 2 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readUint2(offset: PointerLike): number;
	/**
	 * Read a 4-bit signed integer and advance a supplied Pointer by 4 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readInt4(offset: PointerLike): number;
	/**
	 * Read a 4-bit unsigned integer and advance a supplied Pointer by 4 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readUint4(offset: PointerLike): number;
	/**
	 * Read a 8-bit signed integer and advance a supplied Pointer by 8 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readInt8(offset: PointerLike): number;
	/**
	 * Read a 8-bit unsigned integer and advance a supplied Pointer by 8 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readUint8(offset: PointerLike): number;
	/**
	 * Read a 16-bit signed integer and advance a supplied Pointer by 16 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readInt16(offset: PointerLike): number;
	/**
	 * Read a 16-bit unsigned integer and advance a supplied Pointer by 16 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readUint16(offset: PointerLike): number;
	/**
	 * Read a 32-bit signed integer and advance a supplied Pointer by 32 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readInt32(offset: PointerLike): number;
	/**
	 * Read a 32-bit unsigned integer and advance a supplied Pointer by 32 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readUint32(offset: PointerLike): number;
	/**
	 * Read a 64-bit signed integer and advance a supplied Pointer by 64 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length. Values outside the safe integer range can lose
	 * precision.
	 */
	readInt64(offset: PointerLike): number;
	/**
	 * Read a 64-bit unsigned integer and advance a supplied Pointer by 64 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length. Values outside the safe integer range can lose
	 * precision.
	 */
	readUint64(offset: PointerLike): number;
	/**
	 * Read a 32-bit signed integer and advance a supplied Pointer by 32 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded bigint. Reads do not check written length.
	 */
	readBigInt32(offset: PointerLike): bigint;
	/**
	 * Read a 32-bit unsigned integer and advance a supplied Pointer by 32 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded bigint. Reads do not check written length.
	 */
	readBigUint32(offset: PointerLike): bigint;
	/**
	 * Read a 64-bit signed integer and advance a supplied Pointer by 64 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded bigint. Reads do not check written length.
	 */
	readBigInt64(offset: PointerLike): bigint;
	/**
	 * Read a 64-bit unsigned integer and advance a supplied Pointer by 64 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded bigint. Reads do not check written length.
	 */
	readBigUint64(offset: PointerLike): bigint;
	/**
	 * Read a 32-bit floating-point and advance a supplied Pointer by 32 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readFloat32(offset: PointerLike): number;
	/**
	 * Read a 64-bit floating-point and advance a supplied Pointer by 64 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	readFloat64(offset: PointerLike): number;

	/** Encode the written words using the binary codec’s CJK codepoint ranges. This is not UTF-16 text encoding. */
	toString(): string;
	/** Return a copy of the words touched by writes. */
	toArray(): Uint16Array;
}
