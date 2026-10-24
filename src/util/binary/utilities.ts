/** Built-in numeric and bigint typed-array views. */
export type TypedArray =
	| Int8Array
	| Uint8Array
	| Uint8ClampedArray
	| Int16Array
	| Uint16Array
	| Int32Array
	| Uint32Array
	| Float32Array
	| Float64Array
	| BigInt64Array
	| BigUint64Array;

/**
 * Read the entire underlying buffer as 16-bit UTF-16 code units. The view’s byte offset and length are not applied.
 * @param buffer - Typed-array view over a buffer with an even byte length.
 * @returns Text containing those code units.
 * @throws If the underlying buffer cannot form a Uint16Array.
 */
export function toUTF16(buffer: TypedArray) {
	let result = "";
	for (const value of new Uint16Array(buffer.buffer)) {
		result += String.fromCharCode(value);
	}

	return result;
}

/**
 * Copy a string’s UTF-16 code units into a Uint16Array.
 * @param buffer - Input text.
 * @returns One 16-bit word per JavaScript string code unit.
 */
export function fromUTF16(buffer: string): Uint16Array {
	const result = new Uint16Array(buffer.length);
	for (let i = 0; i < buffer.length; i++) {
		result[i] = buffer.charCodeAt(i);
	}

	return result;
}
