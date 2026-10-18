import {
	type Awaitable,
	type If,
	isFunction,
	returnThis,
} from "./common/utils";
import { OptionError } from "./OptionError";
import { type Err, err, type Ok, ok, Result } from "./Result";

const ValueProperty = Symbol.for("virello/result:Option.value");
const ExistsProperty = Symbol.for("virello/result:Option.exists");

/**
 * Some(value) or None. Some can contain null or undefined explicitly; from() converts nullish values to None. Ordinary
 * callbacks run synchronously and propagate exceptions.
 */
export class Option<T, Exists extends boolean = boolean> {
	/** Branded value to ensure `Success` is typed correctly.
	 * @internal */
	declare protected __STATUS__: Exists;

	private readonly [ValueProperty]: If<Exists, T, null>;
	private readonly [ExistsProperty]: Exists;

	private constructor(value: If<Exists, T, null>, exists: Exists) {
		this[ValueProperty] = value;
		this[ExistsProperty] = exists;
	}

	/** Return `true` if the option is a `Some` value. */
	public isSome(): this is Some<T> {
		return this[ExistsProperty];
	}

	/** Return true only for Some whose value passes the callback. A type-guard callback narrows the value type. */
	public isSomeAnd<R extends T>(cb: (value: T) => value is R): this is Some<R>;
	/** Return true only for Some whose value passes the callback. A type-guard callback narrows the value type. */
	public isSomeAnd<R extends boolean>(cb: (value: T) => R): this is Some<R> & R;
	/** Return true only for Some whose value passes the callback. A type-guard callback narrows the value type. */
	public isSomeAnd<R extends boolean>(
		cb: (value: T) => R,
	): this is Some<R> & R {
		return this.isSome() && cb(this[ValueProperty]);
	}

	/** Return `true` if the option is a `None` value. */
	public isNone(): this is None {
		return !this[ExistsProperty];
	}

	/** Return true for None, or test a Some value with the callback. */
	public isNoneOr<R extends T>(
		cb: (value: T) => value is R,
	): this is None | Some<R>;
	/** Return true for None, or test a Some value with the callback. */
	public isNoneOr<R extends boolean>(cb: (value: T) => R): If<Exists, R, true>;
	/** Return true for None, or test a Some value with the callback. */
	public isNoneOr<R extends boolean>(cb: (value: T) => R): If<Exists, R, true> {
		return this.match({ some: (value) => cb(value), none: () => true });
	}

	/**
	 * Return the Some value.
	 * @param message - Message for the OptionError thrown for None.
	 */
	public expect(message: string): If<Exists, T, never> {
		if (this.isNone()) throw new OptionError(message);
		// @ts-expect-error Complex types
		return this[ValueProperty];
	}

	/** Return the Some value, or throw OptionError for None. */
	public unwrap(): If<Exists, T, never> {
		if (this.isNone()) throw new OptionError("Unwrap failed");
		// @ts-expect-error Complex types
		return this[ValueProperty];
	}

	/** Return the Some value, or the supplied default for None. */
	public unwrapOr<OutputValue>(
		defaultValue: OutputValue,
	): If<Exists, T, OutputValue> {
		return this.match({ some: (value) => value, none: () => defaultValue });
	}

	/** Return the Some value, or call cb and return its result for None. */
	public unwrapOrElse<OutputValue>(
		cb: () => OutputValue,
	): If<Exists, T, OutputValue> {
		return this.match({ some: (value) => value, none: cb });
	}

	/** Map a Some value into a new Some; keep None unchanged. The callback’s result is stored without awaiting it. */
	public map<U>(cb: (value: T) => U): Option<U, Exists> {
		// @ts-expect-error Complex types
		return this.match({ some: (value) => some(cb(value)), none: returnThis });
	}

	/** Replace Some with the Option returned by cb; keep None unchanged. */
	public mapInto<OutputOption extends AnyOption>(
		cb: (value: T) => OutputOption,
	): OutputOption {
		// @ts-expect-error Complex types
		return this.match({ some: (value) => cb(value), none: returnThis });
	}

	/** Map Some with cb, or return the supplied default for None. */
	public mapOr<MappedOutputValue, DefaultOutputValue>(
		defaultValue: DefaultOutputValue,
		cb: (value: T) => MappedOutputValue,
	): If<Exists, MappedOutputValue, DefaultOutputValue> {
		return this.match({ some: (value) => cb(value), none: () => defaultValue });
	}

	/** Map Some with cb, or call defaultValue for None. Return the selected result directly. */
	public mapOrElse<OutputValue, OutputNone>(
		defaultValue: () => OutputNone,
		cb: (value: T) => OutputValue,
	): If<Exists, OutputValue, OutputNone> {
		return this.match({
			some: (value) => cb(value),
			none: () => defaultValue(),
		});
	}

	/** Keep Some, or call cb to create a replacement Option for None. */
	public mapNoneInto<OutputOption extends AnyOption>(
		cb: () => OutputOption,
	): If<Exists, Some<T>, OutputOption> {
		return this.match({ some: returnThis, none: cb });
	}

	/** Call cb for Some, ignore its return value, and return this Option. */
	public inspect(cb: (value: T) => void): this {
		if (this.isSome()) cb(this[ValueProperty]);
		return this;
	}

	/** Await cb for Some, then return this Option. Callback errors reject. */
	public async inspectAsync(
		cb: (value: T) => Awaitable<unknown>,
	): Promise<this> {
		if (this.isSome()) await cb(this[ValueProperty]);
		return this;
	}

	/** Turn Some(value) into Ok(value), or None into Err(error). */
	public okOr<ErrorValue>(
		error: ErrorValue,
	): If<Exists, Ok<T>, Err<ErrorValue>> {
		return this.match({ some: (value) => ok(value), none: () => err(error) });
	}

	/** Turn Some(value) into Ok(value), or call cb to create the Err error for None. */
	public okOrElse<ErrorValue>(
		cb: () => ErrorValue,
	): If<Exists, Ok<T>, Err<ErrorValue>> {
		return this.match({ some: (value) => ok(value), none: () => err(cb()) });
	}

	/** Yield the Some value once, or yield nothing for None. */
	public *iter(): Generator<T> {
		if (this.isSome()) yield this[ValueProperty];
	}

	/** Return the supplied Option for Some, or keep None. */
	public and<OutputOption extends AnyOption>(
		option: OutputOption,
	): If<Exists, OutputOption, None<never>> {
		return this.match({ some: () => option, none: returnThis });
	}

	/** Call cb with the Some value and return its Option; keep None. */
	public andThen<OutputOption extends AnyOption>(
		cb: (value: T) => OutputOption,
	): OutputOption {
		// @ts-expect-error Complex types
		return this.match({ some: (value) => cb(value), none: returnThis });
	}

	/** Keep Some, or return the supplied Option for None. */
	public or<OutputOption extends AnyOption>(
		option: OutputOption,
	): If<Exists, Some<T>, OutputOption> {
		return this.match({ some: returnThis, none: () => option });
	}

	/** Keep Some, or call cb to create a replacement for None. */
	public orElse<OutputOption extends AnyOption>(
		cb: () => OutputOption,
	): If<Exists, Some<T>, OutputOption> {
		return this.match({ some: returnThis, none: () => cb() });
	}

	/** Return the only Some when exactly one operand is Some; return None when both or neither are Some. */
	public xor<OtherValue, OtherExists extends boolean>(
		option: Option<OtherValue, OtherExists>,
	): If<
		Exists,
		If<OtherExists, None, Some<T>>,
		Option<OtherValue, OtherExists>
	> {
		return this.match<
			If<OtherExists, None, Some<T>>,
			Option<OtherValue, OtherExists>
		>({
			some() {
				return (option.isNone() ? this : none) as If<
					OtherExists,
					None,
					Some<T>
				>;
			},
			none: () => option,
		});
	}

	/** Keep Some only if its value passes the predicate; otherwise return None. A type-guard predicate narrows the kept type. */
	public filter<R extends T>(predicate: (value: T) => value is R): Option<R>;
	/** Keep Some only if its value passes the predicate; otherwise return None. A type-guard predicate narrows the kept type. */
	public filter(predicate: (value: T) => boolean): Option<T>;
	/** Keep Some only if its value passes the predicate; otherwise return None. A type-guard predicate narrows the kept type. */
	public filter(predicate: (value: T) => boolean): Option<T> {
		return this.isSomeAnd(predicate) ? this : none;
	}

	/** Check whether this is Some with a strictly equal value. Objects compare by identity. */
	public contains<const Value extends T>(
		value: If<Exists, Value, unknown>,
	): this is Some<Value> {
		return this.isSomeAnd((inner) => inner === value);
	}

	/** Return Some([left, right]) when both Options are Some; otherwise return None. */
	public zip<OtherValue, OtherExists extends boolean>(
		other: Option<OtherValue, OtherExists>,
	): Option<[T, OtherValue], If<Exists, OtherExists, false>>;
	/** Return Some([left, right]) when both Options are Some; otherwise return None. */
	public zip<OtherValue>(other: Option<OtherValue>): Option<[T, OtherValue]> {
		return this.isSome() && other.isSome()
			? some<[T, OtherValue]>([this[ValueProperty], other[ValueProperty]])
			: none;
	}

	/** Combine two Some values with f and wrap its result in Some; otherwise return None. */
	public zipWith<OtherValue, OtherExists extends boolean, ReturnValue>(
		other: Option<OtherValue, OtherExists>,
		f: (value0: T, value1: OtherValue) => ReturnValue,
	): Option<ReturnValue, If<Exists, OtherExists, false>>;
	/** Combine two Some values with f and wrap its result in Some; otherwise return None. */
	public zipWith<OtherValue, ReturnValue>(
		other: Option<OtherValue>,
		f: (value0: T, value1: OtherValue) => ReturnValue,
	): Option<ReturnValue> {
		return this.isSome() && other.isSome()
			? some(f(this[ValueProperty], other[ValueProperty]))
			: none;
	}

	/** Split Some([left, right]) into two Some values; None becomes [None, None]. */
	public unzip<Value0, Value1, Exists extends boolean>(
		this: Option<readonly [Value0, Value1], Exists>,
	): [Option<Value0, Exists>, Option<Value1, Exists>] {
		// @ts-expect-error Complex types
		return this.match({
			some: ([value0, value1]) => [some(value0), some(value1)],
			none: () => [none, none],
		});
	}

	/** Turn Some(Ok(value)) into Ok(Some(value)), Some(Err(error)) into Err(error), and None into Ok(None). */
	public transpose<
		ResultValue,
		ResultError,
		ResultSuccess extends boolean,
		Exists extends boolean,
	>(
		this: Option<Result<ResultValue, ResultError, ResultSuccess>, Exists>,
	): If<
		Exists,
		Result<Some<ResultValue>, ResultError, ResultSuccess>,
		Ok<None>
	> {
		return this.match<
			Result<Some<ResultValue>, ResultError, ResultSuccess>,
			Ok<None>
		>({
			some: (result) => result.map(some),
			none: () => ok(none),
		});
	}

	/** Remove one nested Option layer from Some; preserve None. */
	public flatten<InnerOption extends AnyOption, Exists extends boolean>(
		this: Option<InnerOption, Exists>,
	): If<Exists, InnerOption, None<never>> {
		return this.match({ some: (inner) => inner, none: returnThis });
	}

	/** Await the Some value and wrap it in Some, or resolve None. A rejected inner promise rejects the result. */
	public intoPromise(): Promise<Option<Awaited<T>, Exists>> {
		// @ts-expect-error Complex types
		return this.match({
			some: async (value) => some(await value), // NOSONAR
			none: () => Promise.resolve(none),
		});
	}

	/** Check presence and strict equality of stored values. Objects compare by identity. */
	public eq<OtherValue, OtherExists extends boolean>(
		other: Option<OtherValue, OtherExists>,
	): this is this & Option<OtherValue, OtherExists> {
		const value: unknown = this[ValueProperty];
		return this.isSome() === other.isSome() && value === other[ValueProperty];
	}

	/** Return the opposite of eq. */
	public ne(other: AnyOption): boolean {
		return !this.eq(other);
	}

	/** Call the matching callback with this Option as its this value. Some also receives its stored value. Return the callback’s result. */
	public match<SomeValue, NoneValue>(branches: {
		/** Called for Some with its value and the Some Option as this. */
		some(this: Some<T>, value: T): SomeValue;
		/** Called for None with the None Option as this. */
		none(this: None<never>): NoneValue;
	}): If<Exists, SomeValue, NoneValue>;
	/** Call the matching callback with this Option as its this value and return its result. */
	public match<SomeValue, NoneValue>(
		this: Some<T> | None,
		branches: {
			some(this: Some<T>, value: T): SomeValue;
			none(this: None<never>): NoneValue;
		},
	): SomeValue | NoneValue {
		// None has no stored value, irrespective of the original value type.
		return this.isSome()
			? branches.some.call(this, this[ValueProperty])
			: branches.none.call(this as unknown as None<never>);
	}

	/** Yield the Some value once, or yield nothing for None. */
	public [Symbol.iterator](): Generator<T> {
		return this.iter();
	}

	/** Some or None, used by Object.prototype.toString. */
	public get [Symbol.toStringTag](): If<Exists, "Some", "None"> {
		return this.match({ some: () => "Some", none: () => "None" });
	}

	/** Shared empty Option. Prefer this value over constructing Options directly. */
	public static readonly none = new Option<never, false>(null, false);

	/** Create Some(value), including explicit nullish values. Omitting value stores undefined. */
	public static some<T = undefined>(this: void, value?: T): Some<T>;
	/** Create Some(value), including explicit nullish values. Omitting value stores undefined. */
	public static some<T>(this: void, value: T): Some<T> {
		return new Option<T, true>(value, true);
	}

	/** Recognize an Option, including compatible instances from another copy of the library. */
	public static [Symbol.hasInstance](instance: unknown): boolean {
		return (
			typeof instance === "object" &&
			instance !== null &&
			ValueProperty in instance &&
			ExistsProperty in instance
		);
	}

	/** Recognize an Option, including compatible instances from another copy of the library.
	 * @deprecated Use {@link Option.isOption} instead. */
	public static is(instance: unknown): instance is AnyOption {
		return Option[Symbol.hasInstance](instance);
	}

	/** Recognize an Option, including compatible instances from another copy of the library. */
	public static isOption(instance: unknown): instance is AnyOption {
		return Option[Symbol.hasInstance](instance);
	}

	/** Convert a value, existing Option, or synchronous callback result into an Option. Nullish values and thrown errors become None. */
	public static from<T>(
		this: void,
		op: OptionResolvable<T> | (() => OptionResolvable<T>),
	): Option<T> {
		try {
			return resolve(isFunction(op) ? op() : op);
		} catch {
			return none;
		}
	}

	/** Await a value, existing Option, or callback result. Nullish values, thrown errors, and rejected promises become None. */
	public static async fromAsync<T>(
		this: void,
		op: Awaitable<OptionResolvable<T>> | (() => Awaitable<OptionResolvable<T>>),
	): Promise<Option<T>> {
		try {
			return resolve(await (isFunction(op) ? op() : op));
		} catch {
			return none;
		}
	}

	/** Collect Some values in order, stopping at the first None. Empty input returns Some([]). */
	public static all<const Entries extends readonly AnyOption[]>(
		this: void,
		results: Entries,
	): Option<UnwrapSomeArray<Entries>> {
		const values: unknown[] = [];
		for (const result of results) {
			if (result.isNone()) return result as None<never>;

			values.push(result[ValueProperty]);
		}

		return some(values as UnwrapSomeArray<Entries>);
	}

	/** Return the first Some, or None when no entry is Some. Empty input returns None. */
	public static any<const Entries extends readonly AnyOption[]>(
		this: void,
		results: Entries,
	): Option<UnwrapSome<Entries[number]>> {
		for (const result of results) {
			if (result.isSome()) return result as Some<UnwrapSome<Entries[number]>>;
		}

		return none;
	}
}

/** Types and helpers for {@link Option}. */
export declare namespace Option {
	/** Option whose branch is known to contain a value, including explicit nullish values. */
	export type Some<T> = Option<T, true>;
	/** Option whose branch is known to be empty. */
	export type None<T = unknown> = Option<T, false>;
	/** Option with an unrestricted value type and unknown presence. */
	export type Any = Option<unknown>;
	/** Value, nullish value, or existing Option accepted by Option.from. */
	export type Resolvable<T, Exists extends boolean = boolean> =
		T | null | undefined | Option<T, Exists>;
	/** Extract a Some value type, or never for None. */
	export type UnwrapSome<T extends AnyOption> =
		T extends Some<infer S> ? S : never;
	/** Map an Option tuple or array to its Some value types. */
	export type UnwrapSomeArray<T extends readonly AnyOption[] | []> = {
		-readonly [P in keyof T]: UnwrapSome<T[P]>;
	};
}

export const { some, none } = Option;

function resolve<T>(value: Option.Resolvable<T>): Option<T> {
	if (value === null || value === undefined) return none;
	if (Option.isOption(value)) return value;
	return some(value);
}

/** Value, nullish value, or existing Option accepted by Option.from. */
export type OptionResolvable<
	T,
	Exists extends boolean = boolean,
> = Option.Resolvable<T, Exists>;

/** Option whose value is known to be present. */
export type Some<T> = Option.Some<T>;
/** Option known to have no value. */
export type None<T = unknown> = Option.None<T>;
/** Option with an unrestricted value type. */
export type AnyOption = Option.Any;

/** Extract an Option’s Some value type. */
export type UnwrapSome<T extends AnyOption> = Option.UnwrapSome<T>;
/** Map Option entries to their Some value types. */
export type UnwrapSomeArray<T extends readonly AnyOption[] | []> =
	Option.UnwrapSomeArray<T>;
