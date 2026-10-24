/** JavaScript primitive value, including null and undefined. */
export type Primitive =
	string | number | boolean | bigint | symbol | undefined | null;

/** Primitive, function, Date, Error, or RegExp left intact by the deep utility types. */
export type Builtin =
	| Primitive
	| ((...args: never[]) => unknown)
	| AbstractConstructor<unknown>
	| Date
	| Error
	| RegExp;

/** Recursively make object fields and collection values read-only at the type level. Built-ins and callable types are preserved. */
export type DeepReadonly<T> = T extends Builtin
	? T
	: // Skip class constructors and functions
		T extends AbstractConstructor<unknown> | ((...args: never[]) => unknown)
		? T
		: T extends ReadonlyMap<infer K, infer V>
			? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
			: T extends ReadonlySet<infer U>
				? ReadonlySet<DeepReadonly<U>>
				: T extends readonly [] | readonly [...never[]]
					? readonly []
					: T extends readonly [infer U, ...infer V]
						? readonly [DeepReadonly<U>, ...DeepReadonly<V>]
						: T extends readonly [...infer U, infer V]
							? readonly [...DeepReadonly<U>, DeepReadonly<V>]
							: T extends ReadonlyArray<infer U>
								? ReadonlyArray<DeepReadonly<U>>
								: T extends object
									? { readonly [K in keyof T]: DeepReadonly<T[K]> }
									: unknown;

/** Recursively require properties and remove nullish values, including collection entries and promised values. */
export type DeepRequired<T> = T extends Builtin
	? NonNullable<T>
	: T extends Map<infer K, infer V>
		? Map<DeepRequired<K>, DeepRequired<V>>
		: T extends ReadonlyMap<infer K, infer V>
			? ReadonlyMap<DeepRequired<K>, DeepRequired<V>>
			: T extends WeakMap<infer K, infer V>
				? WeakMap<DeepRequired<K>, DeepRequired<V>>
				: T extends Set<infer U>
					? Set<DeepRequired<U>>
					: T extends ReadonlySet<infer U>
						? ReadonlySet<DeepRequired<U>>
						: T extends WeakSet<infer U>
							? WeakSet<DeepRequired<U>>
							: T extends Promise<infer U>
								? Promise<DeepRequired<U>>
								: T extends NonNullable<unknown>
									? { [K in keyof T]-?: DeepRequired<T[K]> }
									: NonNullable<T>;

/** Require every property except K, whose properties become optional. */
export type RequiredExcept<T, K extends keyof T> = Partial<Pick<T, K>> &
	Required<Omit<T, K>>;

/** Require the properties in K and make all other properties optional. */
export type PartialRequired<T, K extends keyof T> = Partial<Omit<T, K>> &
	Required<Pick<T, K>>;

/** Recursively make object properties optional, including elements inside arrays. */
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends Array<infer U>
		? Array<DeepPartial<U>>
		: T[P] extends ReadonlyArray<infer U>
			? ReadonlyArray<DeepPartial<U>>
			: DeepPartial<T[P]>;
};

/** Extract a function’s parameter tuple. */
export type ArgumentTypes<F extends (...args: never[]) => unknown> = F extends (
	...args: infer A
) => unknown
	? A
	: never;

/** A readonly array of any values. */
export type AnyReadonlyArray = readonly unknown[];

/** A generic constructor with parameters */
export type Ctor<
	A extends AnyReadonlyArray = readonly never[],
	R = unknown,
> = new (...args: A) => R;

/** A generic abstract constructor with parameters */
export type AbstractCtor<
	A extends AnyReadonlyArray = readonly never[],
	R = unknown,
> = abstract new (...args: A) => R;

/** Constructor producing T. Supply Args to call it with a known parameter tuple; the default accepts arbitrary constructor signatures for type constraints. */
export type Constructor<T, Args extends readonly unknown[] = never[]> = new (
	...args: Args
) => T;

/** Abstract constructor producing T. Supply Args for its parameter tuple; the default accepts arbitrary constructor signatures for type constraints. */
export type AbstractConstructor<
	T,
	Args extends readonly unknown[] = never[],
> = abstract new (...args: Args) => T;

/** Get the first argument of any given function */
export type FirstArgument<T> = T extends (
	arg1: infer U,
	...args: unknown[]
) => unknown
	? U
	: unknown;

/** Get the second argument of any given function */
export type SecondArgument<T> = T extends (
	arg1: unknown,
	arg2: infer U,
	...args: unknown[]
) => unknown
	? U
	: unknown;

/** ReturnType for a function that can return either a value or a `Promise` with that value */
export type Awaitable<T> = PromiseLike<T> | T;

/** Either null or undefined. */
export type Nullish = null | undefined;

/** Similar to the built in {@link NonNullable}, but properly removes `null` from all keys in the class or interface This does not recurse deeply, for that use {@link DeepRequired} */
export type NonNullableProperties<T = unknown> = {
	[P in keyof T]: NonNullable<T[P]>;
};

/** An object that is non nullable, to bypass TypeScript not easily working with `Record<PropertyKey, unknown>` in various instances.
 * @deprecated Use the `object` type instead. */
export type NonNullObject = object;

/** An object with string keys. Prefer the built-in object type.
 * @deprecated Use the `object` type instead. */
export type AnyObject<T> = {
	[K in keyof T]: T[K];
};

/** An utility type that fuses intersections of objects. */
export type PrettifyObject<T extends object> = {
	[K in keyof T]: T[K];
};

/** Get all the keys (as a string union) from a type `T` that match value `V` */
export type PickByValue<T, V> = {
	[P in keyof T]: T[P] extends V ? P : never;
}[keyof T] &
	keyof T;

/** Transforms a `readonly` type to be mutable */
export type Mutable<T> = {
	-readonly [P in keyof T]: T[P] extends Array<unknown> | object
		? Mutable<T[P]>
		: T[P];
};

/** Transforms every key in an object to be strictly required, essentially removing `undefined` and `null` from the type. */
export type StrictRequired<T> = {
	[P in keyof T]-?: NonNullable<T[P]>;
};

/** Get a union type of all the keys that are in an array. */
export type ArrayElementType<T> = T extends (infer K)[]
	? K
	: T extends readonly (infer RK)[]
		? RK
		: T;

/** A type utility that allows branching of types depending on the `Value` parameter. */
export type If<
	Value extends boolean,
	TrueResult,
	FalseResult,
> = Value extends true
	? TrueResult
	: Value extends false
		? FalseResult
		: TrueResult | FalseResult;

/** A type utility that allows branching of an union type on the `Value` parameter. */
export type RequiredIf<
	Value extends boolean,
	ValueType,
	FallbackType = null,
> = If<Value, ValueType, ValueType | FallbackType>;
