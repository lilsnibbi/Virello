import type { DuplexBuffer } from "../buffer/DuplexBuffer";
import { UnalignedUint16Array } from "../buffer/UnalignedUint16Array";
import { Pointer, type PointerLike } from "../shared/Pointer";
import { type IType, t } from "../types/index";

/** Ordered named binary fields with a 16-bit schema ID prefixed to serialized values. */
export class Schema<
	Id extends number = number,
	Entries extends object = object,
> {
	readonly #id: Id;
	readonly #types = new Map<string, IType<unknown, number | null>>();
	#bitSize: number | null = 0;

	/**
	 * Create an empty schema.
	 * @param id - Identifier encoded in a 16-bit field. Use distinct IDs that fit that field.
	 */
	public constructor(id: Id) {
		this.#id = id;
	}

	/** The id of the schema. */
	public get id(): Id {
		return this.#id;
	}

	/** Combined field size in bits, or null if any field has variable size. */
	public get bitSize(): number | null {
		return this.#bitSize;
	}

	/** Combined field size plus the 16-bit ID, or null for variable-size schemas. */
	public get totalBitSize(): number | null {
		return this.#bitSize === null ? null : this.#bitSize + 16;
	}

	/**
	 * Get a field codec by name.
	 * @param name - Registered field name.
	 * @returns Its codec.
	 * @throws If the field is absent.
	 */
	public get<const Name extends keyof Entries & string>(
		name: Name,
	): Entries[Name] {
		const type = this.#types.get(name) as Entries[Name];
		if (!type)
			throw new Error(
				`Schema with id ${this.#id} does not have a property with name "${name}"`,
			);
		return type;
	}

	/**
	 * Encode a value, including the schema ID, as codec text.
	 * @param value - Input fields in this schema.
	 * @param defaultMaximumArrayLength - Word capacity used for variable-size schemas; defaults to 100.
	 * @returns Encoded codec text. Buffer and field errors propagate.
	 */
	public serialize(
		value: Readonly<SerializeValueEntries<Entries>>,
		defaultMaximumArrayLength = 100,
	): string {
		return this.serializeRaw(value, defaultMaximumArrayLength).toString();
	}

	/**
	 * Encode a value, including the schema ID, into a new buffer.
	 * @param value - Input fields in this schema.
	 * @param defaultMaximumArrayLength - Word capacity for variable-size schemas; defaults to 100. Fixed schemas use
	 * totalBitSize as their word capacity.
	 * @returns The written buffer. Buffer and field errors propagate.
	 */
	public serializeRaw(
		value: Readonly<SerializeValueEntries<Entries>>,
		defaultMaximumArrayLength = 100,
	): DuplexBuffer {
		const buffer = new UnalignedUint16Array(
			this.totalBitSize ?? defaultMaximumArrayLength,
		);
		this.serializeInto(buffer, value);
		return buffer;
	}

	/** Serialize a value into a buffer. */
	public serializeInto(
		buffer: DuplexBuffer,
		value: Readonly<SerializeValueEntries<Entries>>,
	): void {
		buffer.writeInt16(this.#id);
		for (const [name, type] of this) {
			(type as IType<unknown, number | null>).serialize(
				buffer,
				(value as Record<keyof Entries, unknown>)[name],
			);
		}
	}

	/** Deserialize a value from a buffer. */
	public deserialize(
		buffer: DuplexBuffer | string,
		pointer: PointerLike,
	): UnwrapSchemaEntries<Entries> {
		buffer = UnalignedUint16Array.from(buffer);
		pointer = Pointer.from(pointer);
		const result = Object.create(null) as UnwrapSchemaEntries<Entries>;
		for (const [name, type] of this) {
			// @ts-expect-error Complex types
			result[name] = type.deserialize(buffer, pointer);
		}
		return result;
	}

	/** Adds an array property to the schema.  @seealso {@link Schema.fixedLengthArray} for a fixed length array */
	public array<
		const Name extends string,
		const ValueType,
		const ValueBitSize extends number | null,
	>(name: Name, type: IType<ValueType, ValueBitSize>) {
		return this.#addType(name, t.array(type));
	}

	/** Adds a fixed length array property to the schema.  @seealso {@link Schema.array} for a dynamic length array */
	public fixedLengthArray<
		const Name extends string,
		const ValueType,
		const ValueBitSize extends number | null,
	>(name: Name, type: IType<ValueType, ValueBitSize>, length: number) {
		return this.#addType(name, t.fixedLengthArray(type, length));
	}

	/** Adds a string property to the schema. */
	public string<const Name extends string>(name: Name) {
		return this.#addType(name, t.string);
	}

	/** Adds a boolean property to the schema. */
	public boolean<const Name extends string>(name: Name) {
		return this.#addType(name, t.boolean);
	}

	/** Adds a bit property to the schema. */
	public bit<const Name extends string>(name: Name) {
		return this.#addType(name, t.bit);
	}

	/** Adds a 2-bit integer property to the schema. */
	public int2<const Name extends string>(name: Name) {
		return this.#addType(name, t.int2);
	}

	/** Adds a 2-bit unsigned integer property to the schema. */
	public uint2<const Name extends string>(name: Name) {
		return this.#addType(name, t.uint2);
	}

	/** Adds a 4-bit integer property to the schema. */
	public int4<const Name extends string>(name: Name) {
		return this.#addType(name, t.int4);
	}

	/** Adds a 4-bit unsigned integer property to the schema. */
	public uint4<const Name extends string>(name: Name) {
		return this.#addType(name, t.uint4);
	}

	/** Adds a 8-bit integer property to the schema. */
	public int8<const Name extends string>(name: Name) {
		return this.#addType(name, t.int8);
	}

	/** Adds a 8-bit unsigned integer property to the schema. */
	public uint8<const Name extends string>(name: Name) {
		return this.#addType(name, t.uint8);
	}

	/** Adds a 16-bit integer property to the schema. */
	public int16<const Name extends string>(name: Name) {
		return this.#addType(name, t.int16);
	}

	/** Adds a 16-bit unsigned integer property to the schema. */
	public uint16<const Name extends string>(name: Name) {
		return this.#addType(name, t.uint16);
	}

	/** Adds a 32-bit integer property to the schema. */
	public int32<const Name extends string>(name: Name) {
		return this.#addType(name, t.int32);
	}

	/** Adds a 32-bit unsigned integer property to the schema. */
	public uint32<const Name extends string>(name: Name) {
		return this.#addType(name, t.uint32);
	}

	/** Adds a 64-bit integer property to the schema. */
	public int64<const Name extends string>(name: Name) {
		return this.#addType(name, t.int64);
	}

	/** Adds a 64-bit unsigned integer property to the schema. */
	public uint64<const Name extends string>(name: Name) {
		return this.#addType(name, t.uint64);
	}

	/** Adds a 32-bit big integer property to the schema. */
	public bigInt32<const Name extends string>(name: Name) {
		return this.#addType(name, t.bigInt32);
	}

	/** Adds a 32-bit big integer property to the schema. */
	public bigUint32<const Name extends string>(name: Name) {
		return this.#addType(name, t.bigUint32);
	}

	/** Adds a 64-bit big integer property to the schema. */
	public bigInt64<const Name extends string>(name: Name) {
		return this.#addType(name, t.bigInt64);
	}

	/** Adds a 64-bit big integer property to the schema. */
	public bigUint64<const Name extends string>(name: Name) {
		return this.#addType(name, t.bigUint64);
	}

	/** Adds a 32-bit floating point number property to the schema. */
	public float32<const Name extends string>(name: Name) {
		return this.#addType(name, t.float32);
	}

	/** Adds a 64-bit floating point number property to the schema. */
	public float64<const Name extends string>(name: Name) {
		return this.#addType(name, t.float64);
	}

	/** Adds a nullable property to the schema. */
	public nullable<
		const Name extends string,
		const ValueType,
		const ValueBitSize extends number | null,
	>(name: Name, type: IType<ValueType, ValueBitSize>) {
		return this.#addType(name, t.nullable(type));
	}

	/** Adds a 64-bit big integer property to the schema, similar to {@link Schema.bigUint64}. */
	public snowflake<const Name extends string>(name: Name) {
		return this.#addType(name, t.snowflake);
	}

	/** Adds a constant value in the schema, this will **not** be serialized and can be used to add extra data without making the payload bigger. */
	public constant<const Name extends string, const ValueType>(
		name: Name,
		constantValue: ValueType,
	) {
		return this.#addType(name, t.constant(constantValue));
	}

	/** Iterates over the schema's property names. */
	public keys(): IterableIterator<keyof Entries & string> {
		return this.#types.keys() as IterableIterator<keyof Entries & string>;
	}

	/** Iterates over the schema's property values */
	public values(): IterableIterator<Entries[keyof Entries]> {
		return this.#types.values() as IterableIterator<Entries[keyof Entries]>;
	}

	/** Iterates over the schema's property entries */
	public entries(): IterableIterator<
		{ [K in keyof Entries]: readonly [K, Entries[K]] }[keyof Entries]
	> {
		return this.#types.entries() as IterableIterator<
			{ [K in keyof Entries]: readonly [K, Entries[K]] }[keyof Entries]
		>;
	}

	/** Iterates over the schema's property entries */
	public [Symbol.iterator](): IterableIterator<
		{ [K in keyof Entries]: readonly [K, Entries[K]] }[keyof Entries]
	> {
		return this.entries();
	}

	#addType<
		const EntryName extends string,
		const ValueType,
		const ValueBitSize extends number | null,
		InputValue,
	>(
		name: EntryName,
		type: IType<ValueType, ValueBitSize, InputValue>,
	): Merge<Id, Entries, EntryName, typeof type> {
		if (this.#types.has(name)) {
			throw new Error(
				`Schema with id ${this.#id} already has a property with name "${name}"`,
			);
		}

		this.#types.set(name, type);

		if (type.BIT_SIZE === null) {
			this.#bitSize = null;
		} else if (this.#bitSize !== null) {
			this.#bitSize += type.BIT_SIZE;
		}

		return this as unknown as Merge<Id, Entries, EntryName, typeof type>;
	}
}

type Merge<
	Id extends number,
	Entries extends object,
	EntryName extends string,
	EntryType extends IType<unknown, number | null>,
> = EntryName extends keyof Entries
	? never
	: Schema<
			Id,
			{
				[K in EntryName | keyof Entries]: K extends keyof Entries
					? Entries[K]
					: EntryType;
			}
		>;

/** Names of fields in a schema. */
export type KeyOfSchema<SchemaValue extends object> =
	SchemaValue extends Schema<infer _, infer Type> ? keyof Type & string : never;
/** Union of a schema’s field codec types. */
export type ValueOfSchema<SchemaValue extends object> =
	SchemaValue extends Schema<infer _, infer Type>
		? { [K in keyof Type]: Type[K] }[keyof Type]
		: never;
/** Union of [field name, codec] pairs in a schema. */
export type EntryOfSchema<SchemaValue extends object> =
	SchemaValue extends Schema<infer _, infer Type>
		? { [K in keyof Type]: readonly [K, Type[K]] }[keyof Type]
		: never;

/** Decoded value type of one codec. */
export type UnwrapSchemaType<Type extends object> =
	Type extends IType<infer ValueType, infer _BitSize, infer _InputType>
		? ValueType
		: never;
/** Object of decoded value types for a set of field codecs. */
export type UnwrapSchemaEntries<Entries extends object> = {
	[K in keyof Entries]: UnwrapSchemaType<Entries[K] & object>;
} & object;
/** Object returned when a schema is decoded. */
export type UnwrapSchema<SchemaValue extends object> =
	SchemaValue extends Schema<infer _Id, infer Type>
		? UnwrapSchemaEntries<Type>
		: never;

/**
 * Remove fields whose input type is never, such as constant codecs.
 * @internal
 */
type OmitNever<T> = { [K in keyof T as T[K] extends never ? never : K]: T[K] };
/** Input value type accepted by one codec. */
export type SerializeValueType<Type extends object> =
	Type extends IType<infer _ValueType, infer _BitSize, infer InputType>
		? InputType
		: never;
/** Input fields for a set of codecs, excluding constant fields that accept never. */
export type SerializeValueEntries<Entries extends object> = OmitNever<{
	[K in keyof Entries]: SerializeValueType<Entries[K] & object>;
}>;
/** Object accepted when serializing a schema. */
export type SerializeValue<SchemaValue extends object> =
	SchemaValue extends Schema<infer _Id, infer Type>
		? SerializeValueEntries<Type>
		: never;
