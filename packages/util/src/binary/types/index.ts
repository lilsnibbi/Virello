import { ArrayType } from "./Array";
import { BigInt32Type } from "./BigInt32";
import { BigInt64Type } from "./BigInt64";
import { BigUint32Type } from "./BigUint32";
import { BigUint64Type } from "./BigUint64";
import { BitType } from "./Bit";
import { BooleanType } from "./Boolean";
import type { IType } from "./base/IType";
import { ConstantType } from "./Constant";
import { FixedLengthArrayType } from "./FixedLengthArray";
import { Float32Type } from "./Float32";
import { Float64Type } from "./Float64";
import { Int2Type } from "./Int2";
import { Int4Type } from "./Int4";
import { Int8Type } from "./Int8";
import { Int16Type } from "./Int16";
import { Int32Type } from "./Int32";
import { Int64Type } from "./Int64";
import { NullableType } from "./Nullable";
import { SnowflakeType } from "./Snowflake";
import { StringType } from "./String";
import { Uint2Type } from "./Uint2";
import { Uint4Type } from "./Uint4";
import { Uint8Type } from "./Uint8";
import { Uint16Type } from "./Uint16";
import { Uint32Type } from "./Uint32";
import { Uint64Type } from "./Uint64";

/** Built-in binary codecs and factories used by Schema. */
export const t = {
	/** Factory for the {@link ArrayType} codec. */
	array: ArrayType,
	/** Codec for a signed 32-bit bigint. */
	bigInt32: BigInt32Type,
	/** Codec for a signed 64-bit bigint. */
	bigInt64: BigInt64Type,
	/** Codec for a unsigned 32-bit bigint. */
	bigUint32: BigUint32Type,
	/** Codec for a unsigned 64-bit bigint. */
	bigUint64: BigUint64Type,
	/** Codec for a one-bit numeric value. */
	bit: BitType,
	/** Codec for a one-bit boolean. */
	boolean: BooleanType,
	/** Factory for the {@link ConstantType} codec. */
	constant: ConstantType,
	/** Factory for the {@link FixedLengthArrayType} codec. */
	fixedLengthArray: FixedLengthArrayType,
	/** Codec for a 32-bit floating-point number. */
	float32: Float32Type,
	/** Codec for a 64-bit floating-point number. */
	float64: Float64Type,
	/** Codec for a signed 16-bit integer. */
	int16: Int16Type,
	/** Codec for a signed 2-bit integer. */
	int2: Int2Type,
	/** Codec for a signed 32-bit integer. */
	int32: Int32Type,
	/** Codec for a signed 4-bit integer. */
	int4: Int4Type,
	/** Codec for a signed 64-bit number. */
	int64: Int64Type,
	/** Codec for a signed 8-bit integer. */
	int8: Int8Type,
	/** Factory for the {@link NullableType} codec. */
	nullable: NullableType,
	/** Codec for a unsigned 64-bit bigint decoded from a bigint or string input. */
	snowflake: SnowflakeType,
	/** Codec for a UTF-8 string with a 16-bit byte-length prefix. */
	string: StringType,
	/** Codec for a unsigned 16-bit integer. */
	uint16: Uint16Type,
	/** Codec for a unsigned 2-bit integer. */
	uint2: Uint2Type,
	/** Codec for a unsigned 32-bit integer. */
	uint32: Uint32Type,
	/** Codec for a unsigned 4-bit integer. */
	uint4: Uint4Type,
	/** Codec for a unsigned 64-bit number. */
	uint64: Uint64Type,
	/** Codec for a unsigned 8-bit integer. */
	uint8: Uint8Type,
};

export {
	ArrayType,
	BigInt32Type,
	BigInt64Type,
	BigUint32Type,
	BigUint64Type,
	BitType,
	BooleanType,
	ConstantType,
	FixedLengthArrayType,
	Float32Type,
	Float64Type,
	Int2Type,
	Int4Type,
	Int8Type,
	Int16Type,
	Int32Type,
	Int64Type,
	type IType,
	NullableType,
	SnowflakeType,
	StringType,
	Uint2Type,
	Uint4Type,
	Uint8Type,
	Uint16Type,
	Uint32Type,
	Uint64Type,
};
