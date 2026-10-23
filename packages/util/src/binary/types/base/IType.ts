import type { DuplexBuffer } from "../../buffer/DuplexBuffer";
import type { Pointer } from "../../shared/Pointer";

/** Binary codec with an input type, decoded value type, and fixed bit size or null for variable size. */
export interface IType<
	ValueType,
	BitSize extends number | null,
	InputValue = ValueType,
> {
	/** Serialize a value to a buffer. */
	serialize(buffer: DuplexBuffer, value: InputValue): void;

	/** Deserialize a value from a buffer. */
	deserialize(buffer: DuplexBuffer, pointer: Pointer): ValueType;

	/** The size of the value in bits, or `null` if the size is variable. */
	readonly BIT_SIZE: BitSize;
}
