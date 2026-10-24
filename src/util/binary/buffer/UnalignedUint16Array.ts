import { codepointRanges } from "../shared/codepoints";
import { Pointer, type PointerLike } from "../shared/Pointer";
import type { DuplexBuffer } from "./DuplexBuffer";

const ConverterUint8 = new Uint8Array(8);
const ConverterUint16 = new Uint16Array(ConverterUint8.buffer);
const ConverterUint32 = new Uint32Array(ConverterUint8.buffer);
const ConverterUint64 = new BigUint64Array(ConverterUint8.buffer);

const ConverterInt32 = new Int32Array(ConverterUint8.buffer);
const ConverterInt64 = new BigInt64Array(ConverterUint8.buffer);

const ConverterFloat = new Float32Array(ConverterUint8.buffer);
const ConverterDouble = new Float64Array(ConverterUint8.buffer);

/** Bit-oriented buffer backed by 16-bit words. Reads use bit offsets; numeric values are packed low bits first. */
export class UnalignedUint16Array implements DuplexBuffer {
	#buffer: Uint16Array;
	#bitLength = 0;
	#wordIndex = 0;
	#wordLength = 0;

	/**
	 * Allocate an empty bit buffer.
	 * @param maxLength - Capacity passed to Uint16Array, in 16-bit words.
	 * @throws If allocation or typed-array length conversion fails.
	 */
	public constructor(maxLength: number) {
		this.#buffer = new Uint16Array(maxLength);
	}

	/**
	 * Read a backing 16-bit word by index. Negative indices count from the backing array’s end.
	 * @param index - Word index.
	 * @returns The word, or undefined outside the backing array.
	 */
	public at(index: number): number | undefined {
		return this.#buffer.at(index);
	}

	/** Capacity in 16-bit words. */
	public get maxLength(): number {
		return this.#buffer.length;
	}

	/** Capacity in bits. */
	public get maxBitLength(): number {
		return this.#buffer.length * 16;
	}

	/** Number of words touched by writes, including a partially written final word. */
	public get length(): number {
		return this.#wordLength;
	}

	/** Number of bits written, or the encoded length assigned when loading a string. */
	public get bitLength(): number {
		return this.#bitLength;
	}

	/**
	 * Append one bit: zero for a falsy value, one for a truthy value.
	 * @param value - Bit value.
	 * @throws RangeError when the buffer is full.
	 */
	public writeBit(value: number): void {
		this.#writeBit(value);
	}

	/**
	 * Append a 2-bit integer’s low 2 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	public writeInt2(value: number): void {
		this.writeBit(value & 1);
		this.writeBit(value >> 1);
	}

	/**
	 * Append a 4-bit integer’s low 4 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	public writeInt4(value: number): void {
		this.writeInt2(value & 0b11);
		this.writeInt2(value >> 2);
	}

	/**
	 * Append a 8-bit integer’s low 8 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	public writeInt8(value: number): void {
		this.writeInt4(value & 0b1111);
		this.writeInt4(value >> 4);
	}

	/**
	 * Append a 16-bit integer’s low 16 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	public writeInt16(value: number): void {
		this.#bufferWrite16(value);
	}

	/**
	 * Append a 32-bit integer’s low 32 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	public writeInt32(value: number): void {
		this.#bufferWrite16(value);
		this.#bufferWrite16(value >> 16);
	}

	/**
	 * Append a 64-bit integer’s low 64 bits.
	 * @param value - Value to encode. Integer inputs must be accepted by BigInt().
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	public writeInt64(value: number): void {
		this.writeBigInt64(BigInt(value));
	}

	/**
	 * Append a 32-bit integer’s low 32 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	public writeBigInt32(value: bigint): void {
		ConverterInt64[0] = value;
		this.#bufferWrite16(ConverterUint16[0]);
		this.#bufferWrite16(ConverterUint16[1]);
	}

	/**
	 * Append a 64-bit integer’s low 64 bits.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	public writeBigInt64(value: bigint): void {
		ConverterInt64[0] = value;
		this.#bufferWrite16(ConverterUint16[0]);
		this.#bufferWrite16(ConverterUint16[1]);
		this.#bufferWrite16(ConverterUint16[2]);
		this.#bufferWrite16(ConverterUint16[3]);
	}

	/**
	 * Append a 32-bit IEEE floating-point value.
	 * @param value - Value to encode.
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	public writeFloat32(value: number): void {
		ConverterFloat[0] = value;
		this.#bufferWrite16(ConverterUint16[0]);
		this.#bufferWrite16(ConverterUint16[1]);
	}

	/**
	 * Append a 64-bit IEEE floating-point value.
	 * @param value - Value to encode. Integer inputs must be accepted by BigInt().
	 * @throws RangeError when capacity is exhausted. Multiword writes can leave a partial result.
	 */
	public writeFloat64(value: number): void {
		ConverterDouble[0] = value;
		this.#bufferWrite16(ConverterUint16[0]);
		this.#bufferWrite16(ConverterUint16[1]);
		this.#bufferWrite16(ConverterUint16[2]);
		this.#bufferWrite16(ConverterUint16[3]);
	}

	/**
	 * Read one bit and advance a supplied Pointer by one.
	 * @param offset - Bit offset or shared pointer.
	 * @returns 0 or 1. Reads do not check the written-length boundary.
	 */
	public readBit(offset: PointerLike): 0 | 1 {
		const ptr = Pointer.from(offset);
		return this.#readBit(ptr) as 0 | 1;
	}

	/**
	 * Read a 2-bit signed integer and advance a supplied Pointer by 2 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readInt2(offset: PointerLike): number {
		// Bit shifting to convert 2-bit signed integer to 32-bit signed integer
		// 0b01 → 0b0100_0000_0000_0000 → 0b000_0000_0000_0001 (1)
		// 0b10 → 0b1000_0000_0000_0000 → 0b111_1111_1111_1110 (-2)
		return (this.readUint2(offset) << 30) >> 30;
	}

	/**
	 * Read a 2-bit unsigned integer and advance a supplied Pointer by 2 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readUint2(offset: PointerLike): number {
		const ptr = Pointer.from(offset);
		return this.#readBit(ptr) | (this.#readBit(ptr) << 1);
	}

	/**
	 * Read a 4-bit signed integer and advance a supplied Pointer by 4 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readInt4(offset: PointerLike): number {
		// Bit shifting to convert 4-bit signed integer to 32-bit signed integer,
		// as shown in `readInt2`.
		return (this.readUint4(offset) << 28) >> 28;
	}

	/**
	 * Read a 4-bit unsigned integer and advance a supplied Pointer by 4 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readUint4(offset: PointerLike): number {
		const ptr = Pointer.from(offset);
		return (
			this.#readBit(ptr) |
			(this.#readBit(ptr) << 1) |
			(this.#readBit(ptr) << 2) |
			(this.#readBit(ptr) << 3)
		);
	}

	/**
	 * Read a 8-bit signed integer and advance a supplied Pointer by 8 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readInt8(offset: PointerLike): number {
		// Bit shifting to convert 8-bit signed integer to 32-bit signed integer,
		// as shown in `readInt2`.
		return (this.readUint8(offset) << 24) >> 24;
	}

	/**
	 * Read a 8-bit unsigned integer and advance a supplied Pointer by 8 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readUint8(offset: PointerLike): number {
		const ptr = Pointer.from(offset);
		return this.#readByte(ptr);
	}

	/**
	 * Read a 16-bit signed integer and advance a supplied Pointer by 16 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readInt16(offset: PointerLike): number {
		// Bit shifting to convert 8-bit signed integer to 32-bit signed integer,
		// as shown in `readInt2`.
		return (this.readUint16(offset) << 16) >> 16;
	}

	/**
	 * Read a 16-bit unsigned integer and advance a supplied Pointer by 16 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readUint16(offset: PointerLike): number {
		this.#bufferRead16(Pointer.from(offset));
		return ConverterUint16[0];
	}

	/**
	 * Read a 32-bit signed integer and advance a supplied Pointer by 32 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readInt32(offset: PointerLike): number {
		this.#bufferRead32(Pointer.from(offset));
		return ConverterInt32[0];
	}

	/**
	 * Read a 32-bit unsigned integer and advance a supplied Pointer by 32 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readUint32(offset: PointerLike): number {
		this.#bufferRead32(Pointer.from(offset));
		return ConverterUint32[0];
	}

	/**
	 * Read a 64-bit signed integer and advance a supplied Pointer by 64 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length. Values outside the safe integer range can lose
	 * precision.
	 */
	public readInt64(offset: PointerLike): number {
		return Number(this.readBigInt64(offset));
	}

	/**
	 * Read a 64-bit unsigned integer and advance a supplied Pointer by 64 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length. Values outside the safe integer range can lose
	 * precision.
	 */
	public readUint64(offset: PointerLike) {
		return Number(this.readBigUint64(offset));
	}

	/**
	 * Read a 32-bit signed integer and advance a supplied Pointer by 32 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded bigint. Reads do not check written length.
	 */
	public readBigInt32(offset: PointerLike): bigint {
		this.#bufferRead32(Pointer.from(offset));
		return BigInt(ConverterInt32[0]);
	}

	/**
	 * Read a 32-bit unsigned integer and advance a supplied Pointer by 32 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded bigint. Reads do not check written length.
	 */
	public readBigUint32(offset: PointerLike): bigint {
		this.#bufferRead32(Pointer.from(offset));
		return BigInt(ConverterUint32[0]);
	}

	/**
	 * Read a 64-bit signed integer and advance a supplied Pointer by 64 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded bigint. Reads do not check written length.
	 */
	public readBigInt64(offset: PointerLike): bigint {
		this.#bufferRead64(Pointer.from(offset));
		return ConverterInt64[0];
	}

	/**
	 * Read a 64-bit unsigned integer and advance a supplied Pointer by 64 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded bigint. Reads do not check written length.
	 */
	public readBigUint64(offset: PointerLike): bigint {
		this.#bufferRead64(Pointer.from(offset));
		return ConverterUint64[0];
	}

	/**
	 * Read a 32-bit floating-point and advance a supplied Pointer by 32 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readFloat32(offset: PointerLike): number {
		this.#bufferRead32(Pointer.from(offset));
		return ConverterFloat[0];
	}

	/**
	 * Read a 64-bit floating-point and advance a supplied Pointer by 64 bits.
	 * @param offset - Bit offset or shared pointer.
	 * @returns The decoded number. Reads do not check written length.
	 */
	public readFloat64(offset: PointerLike): number {
		this.#bufferRead64(Pointer.from(offset));
		return ConverterDouble[0];
	}

	/** Encode the written words using the binary codec’s CJK codepoint ranges. This is not UTF-16 text encoding. */
	public toString() {
		let result = "";

		for (let i = 0; i < this.length; i++) {
			result += String.fromCodePoint(this.#uint16ToCodepoint(this.#buffer[i]));
		}

		return result;
	}

	/** Return a copy of the words touched by writes. */
	public toArray(): Uint16Array {
		return this.#buffer.slice(0, this.length);
	}

	#uint16ToCodepoint(index: number): number {
		for (const range of codepointRanges) {
			if (index >= range.indexStart && index <= range.indexEnd) {
				return range.start + (index - range.indexStart);
			}
		}

		throw new RangeError(`Index ${index} is out of range`);
	}

	#readBit(pointer: Pointer) {
		const bitOffset = pointer.value;
		const index = bitOffset >> 4;
		const bitIndex = bitOffset & 0xf;
		pointer.add(1);
		return (this.#buffer[index] >> bitIndex) & 1;
	}

	#readByte(ptr: Pointer) {
		return (
			this.#readBit(ptr) |
			(this.#readBit(ptr) << 1) |
			(this.#readBit(ptr) << 2) |
			(this.#readBit(ptr) << 3) |
			(this.#readBit(ptr) << 4) |
			(this.#readBit(ptr) << 5) |
			(this.#readBit(ptr) << 6) |
			(this.#readBit(ptr) << 7)
		);
	}

	#bufferRead16(ptr: Pointer): void {
		ConverterUint8[0] = this.#readByte(ptr);
		ConverterUint8[1] = this.#readByte(ptr);
	}

	#bufferRead32(ptr: Pointer): void {
		ConverterUint8[0] = this.#readByte(ptr);
		ConverterUint8[1] = this.#readByte(ptr);
		ConverterUint8[2] = this.#readByte(ptr);
		ConverterUint8[3] = this.#readByte(ptr);
	}

	#bufferRead64(ptr: Pointer): void {
		ConverterUint8[0] = this.#readByte(ptr);
		ConverterUint8[1] = this.#readByte(ptr);
		ConverterUint8[2] = this.#readByte(ptr);
		ConverterUint8[3] = this.#readByte(ptr);
		ConverterUint8[4] = this.#readByte(ptr);
		ConverterUint8[5] = this.#readByte(ptr);
		ConverterUint8[6] = this.#readByte(ptr);
		ConverterUint8[7] = this.#readByte(ptr);
	}

	#writeBit(value: number) {
		if (this.#wordIndex === this.maxLength) {
			throw new RangeError(`The buffer is full`);
		}

		if (value) {
			const index = this.#wordIndex;
			const bitIndex = this.bitLength & 0xf;
			this.#buffer[index] |= 1 << bitIndex;
		}

		if ((this.#bitLength & 0xf) === 0) this.#wordLength++;
		this.#bitLength++;
		if ((this.#bitLength & 0xf) === 0) this.#wordIndex++;
	}

	#bufferWrite16(value: number) {
		const wordIndex = this.#wordIndex;
		const bitIndex = this.bitLength & 0xf;

		// If `bitIndex` is `0`:
		// - Then the value will fit in the current word.
		// - In this case, we validate that we can write the current word.
		//
		// Otherwise:
		// - The value will be split between the current word and the next word.
		// - In this case, we validate that we can write the next word.
		if (wordIndex + (bitIndex === 0 ? 0 : 1) === this.maxLength) {
			throw new RangeError(`The buffer is full`);
		}

		if (bitIndex === 0) {
			this.#buffer[wordIndex] = value;
		} else {
			value &= 0xffff;
			this.#buffer[wordIndex] |= value << bitIndex;
			this.#buffer[wordIndex + 1] = value >> (16 - bitIndex);
		}

		this.#bitLength += 16;
		this.#wordIndex++;
		this.#wordLength++;
	}

	/**
	 * Decode a codec string, or reuse a supplied buffer unchanged.
	 * @param value - String emitted by this codec, or existing DuplexBuffer.
	 * @returns A buffer containing the decoded words.
	 * @throws RangeError for codepoints outside the codec’s ranges.
	 */
	public static from(value: string | DuplexBuffer): DuplexBuffer {
		if (typeof value !== "string") return value;

		const codepoints = Array.from(value, (char) => char.codePointAt(0)!);
		const buffer = new UnalignedUint16Array(value.length);

		for (let i = 0; i < codepoints.length; i++) {
			const index = UnalignedUint16Array.#codepointToUint16(codepoints[i]);
			buffer.#buffer[i] = index;
		}

		buffer.#bitLength = value.length << 4;
		return buffer;
	}

	static #codepointToUint16(codepoint: number): number {
		for (const range of codepointRanges) {
			if (codepoint >= range.start && codepoint <= range.end) {
				return range.indexStart + (codepoint - range.start);
			}
		}

		throw new RangeError(`Codepoint ${codepoint} is out of range`);
	}
}
