import type { DuplexBuffer } from "../buffer/DuplexBuffer";
import { UnalignedUint16Array } from "../buffer/UnalignedUint16Array";
import { Pointer } from "../shared/Pointer";
import { Schema, type SerializeValue, type UnwrapSchema } from "./Schema";

/** Collection of schemas keyed by their encoded IDs, with automatic schema selection during decoding. */
export class SchemaStore<Entries extends object = object> {
	/** Word capacity supplied when serializing variable-size schemas. Defaults to 100. */
	public defaultMaximumArrayLength: number;

	readonly #schemas = new Map<
		number,
		Pick<Schema, "serialize" | "serializeRaw" | "deserialize">
	>();

	/** Create a new schema store */
	public constructor(defaultMaximumArrayLength = 100) {
		this.defaultMaximumArrayLength = defaultMaximumArrayLength;
	}

	/**
	 * Register a schema ID and return this store with the added schema in its type.
	 * @param schema - Schema to register.
	 * @throws If the ID is already registered.
	 */
	public add<const Id extends number, const SchemaType extends object>(
		schema: Schema<Id, SchemaType>,
	): Merge<Entries, Id, typeof schema> {
		if (this.#schemas.has(schema.id)) {
			throw new Error(`Schema with id ${schema.id} already exists`);
		}

		this.#schemas.set(schema.id, schema);
		return this as unknown as Merge<Entries, Id, typeof schema>;
	}

	/**
	 * Get a registered schema.
	 * @param id - Schema ID.
	 * @returns The schema.
	 * @throws If the ID is absent.
	 */
	public get<const Id extends KeyOfStore<this>>(id: Id): Entries[Id] {
		const schema = this.#schemas.get(id) as Entries[Id];
		if (!schema) throw new Error(`Schema with id ${id} does not exist`);
		return schema;
	}

	/** Serializes a value using the schema with the given id */
	public serialize<const Id extends KeyOfStore<this>>(
		id: Id,
		value: SerializeValue<Entries[Id] & object>,
	): string {
		return this.serializeRaw(id, value).toString();
	}

	/** Serializes a value using the schema with the given id */
	public serializeRaw<const Id extends KeyOfStore<this>>(
		id: Id,
		value: SerializeValue<Entries[Id] & object>,
	): DuplexBuffer {
		const schema = this.get(id) as Schema<Id, object>;
		return schema.serializeRaw(value, this.defaultMaximumArrayLength);
	}

	/**
	 * Read the schema ID, select its schema, and decode the remaining fields.
	 * @param buffer - Codec text or buffer.
	 * @returns The schema ID and decoded data. Unknown IDs and codec errors propagate.
	 */
	public deserialize(
		buffer: string | DuplexBuffer,
	): DeserializationResult<Entries> {
		buffer = UnalignedUint16Array.from(buffer);
		const pointer = new Pointer();
		const id = buffer.readInt16(pointer) as KeyOfStore<this>;
		const schema = this.get(id) as Schema<number, object>;
		return {
			id,
			data: schema.deserialize(buffer, pointer),
		} as unknown as DeserializationResult<Entries>;
	}

	/** Get the serialized ID from a buffer */
	public getIdentifier(buffer: string | DuplexBuffer): KeyOfStore<this> {
		if (buffer.length === 0) {
			throw new RangeError("Expected a non-empty value");
		}

		if (typeof buffer === "string") {
			// We only need to read the first character:
			buffer = UnalignedUint16Array.from(buffer[0]);
		}

		return buffer.at(0) as KeyOfStore<this>;
	}

	/** Iterates over the modules's schema identifiers. */
	public keys(): IterableIterator<KeyOfStore<this>> {
		return this.#schemas.keys() as IterableIterator<KeyOfStore<this>>;
	}

	/** Iterates over the modules's schemas. */
	public values(): IterableIterator<ValueOfStore<this>> {
		return this.#schemas.values() as IterableIterator<ValueOfStore<this>>;
	}

	/** Iterates over the modules's schema entries. */
	public entries(): IterableIterator<EntryOfStore<this>> {
		return this.#schemas.entries() as IterableIterator<EntryOfStore<this>>;
	}

	/** Iterates over the modules's schema entries. */
	public [Symbol.iterator](): IterableIterator<EntryOfStore<this>> {
		return this.entries();
	}
}

/**
 * Type of a store after adding a new schema ID; duplicate IDs resolve to never.
 * @internal
 */
type Merge<
	Entries extends object,
	Id extends number,
	Type extends object,
> = Id extends keyof Entries
	? never
	: SchemaStore<{
			[K in Id | keyof Entries]: K extends keyof Entries ? Entries[K] : Type;
		}>;

/** Numeric IDs of schemas registered in a SchemaStore. */
export type KeyOfStore<SchemaStoreValue extends object> =
	SchemaStoreValue extends SchemaStore<infer Schemas>
		? keyof Schemas & number
		: never;
/** Union of schemas registered in a SchemaStore. */
export type ValueOfStore<SchemaStoreValue extends object> =
	SchemaStoreValue extends SchemaStore<infer Schemas>
		? Schemas[keyof Schemas & number]
		: never;
/** Union of [schema ID, schema] pairs in a SchemaStore. */
export type EntryOfStore<SchemaStoreValue extends object> =
	SchemaStoreValue extends SchemaStore<infer Schemas>
		? { [K in keyof Schemas]: readonly [K & number, Schemas[K]] }[keyof Schemas]
		: never;

/** Union of decoded { id, data } results for every registered schema. */
export type DeserializationResult<SchemaStoreEntries extends object> = {
	[K in keyof SchemaStoreEntries]: {
		/** Decoded schema ID, narrowing the matching data type. */
		id: K;
		/** Decoded fields belonging to this schema ID. */
		data: UnwrapSchema<SchemaStoreEntries[K] & object>;
	};
}[keyof SchemaStoreEntries];
