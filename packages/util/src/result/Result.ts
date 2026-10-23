import {
	type Awaitable,
	type If,
	isFunction,
	returnThis,
} from "./common/utils";
import { type None, none, type Option, type Some, some } from "./Option";
import { ResultError } from "./ResultError";

const ValueProperty = Symbol.for("virello/result:Result.value");
const SuccessProperty = Symbol.for("virello/result:Result.success");
/** Symbol used to delegate safe unwrapping inside safeTry generators. */
const UnwrapSafeProperty = Symbol.for("virello/result:Result.safeUnwrap");

/**
 * An Ok value or Err error. Create one with Result.ok/err. Ordinary callbacks run synchronously and propagate exceptions;
 * from/fromAsync capture them.
 */
export class Result<T, E, const Success extends boolean = boolean> {
	/** Branded value to ensure `Success` is typed correctly.
	 * @internal */
	declare protected __STATUS__: Success;

	private readonly [ValueProperty]: If<Success, T, E>;
	private readonly [SuccessProperty]: Success;

	private constructor(value: If<Success, T, E>, success: Success) {
		this[ValueProperty] = value;
		this[SuccessProperty] = success;
	}

	/** Return `true` if the result is `Ok`. */
	public isOk(): this is Ok<T, E> {
		return this[SuccessProperty];
	}

	/** Return true only for Ok whose value passes the callback. A type-guard callback also narrows the value type. */
	public isOkAnd<R extends T>(cb: (value: T) => value is R): this is Ok<R, E>;
	/** Return true only for Ok whose value passes the callback. A type-guard callback also narrows the value type. */
	public isOkAnd<R extends boolean>(cb: (value: T) => R): this is Ok<T, E> & R;
	/** Return true only for Ok whose value passes the callback. A type-guard callback also narrows the value type. */
	public isOkAnd<R extends boolean>(cb: (value: T) => R): this is Ok<T, E> & R {
		return this.isOk() && cb(this[ValueProperty]);
	}

	/** Return `true` if the result is `Err`. */
	public isErr(): this is Err<E, T> {
		return !this[SuccessProperty];
	}

	/** Return true only for Err whose error passes the callback. A type-guard callback also narrows the error type. */
	public isErrAnd<R extends E>(cb: (error: E) => error is R): this is Err<R, T>;
	/** Return true only for Err whose error passes the callback. A type-guard callback also narrows the error type. */
	public isErrAnd<R extends boolean>(
		cb: (error: E) => R,
	): this is Err<E, T> & R;
	/** Return true only for Err whose error passes the callback. A type-guard callback also narrows the error type. */
	public isErrAnd<R extends boolean>(
		cb: (error: E) => R,
	): this is Err<E, T> & R {
		return this.isErr() && cb(this[ValueProperty]);
	}

	/** Convert Ok(value) to Some(value), or Err to None. */
	public ok(): If<Success, Some<T>, None> {
		return this.match({ ok: (value) => some(value), err: () => none });
	}

	/** Convert Err(error) to Some(error), or Ok to None. */
	public err(): If<Success, None, Some<E>> {
		return this.match({ ok: () => none, err: (error) => some(error) });
	}

	/** Map an Ok value into a new Ok; preserve Err unchanged. The callback’s result is stored without awaiting it. */
	public map<OutputValue>(
		cb: (value: If<Success, T, never>) => OutputValue,
	): Result<OutputValue, E, Success> {
		// @ts-expect-error Complex types
		return this.match({ ok: (value) => ok(cb(value)), err: returnThis });
	}

	/** Replace an Ok with the Result returned by the callback; preserve Err unchanged. */
	public mapInto<OutputResult extends AnyResult>(
		cb: (value: If<Success, T, never>) => OutputResult,
	): If<Success, OutputResult, Err<E>> {
		return this.match({ ok: (value) => cb(value), err: returnThis });
	}

	/** Map an Ok value, or return the supplied default value for Err. */
	public mapOr<MappedOutputValue, DefaultOutputValue>(
		defaultValue: DefaultOutputValue,
		cb: (value: If<Success, T, never>) => MappedOutputValue,
	): If<Success, MappedOutputValue, DefaultOutputValue> {
		return this.match({ ok: (value) => cb(value), err: () => defaultValue });
	}

	/** Map an Ok with cb, or map its error with op. Return the selected callback’s result directly. */
	public mapOrElse<OutputValue, OutputError>(
		op: (error: If<Success, never, E>) => OutputError,
		cb: (value: If<Success, T, never>) => OutputValue,
	): If<Success, OutputValue, OutputError> {
		return this.match({ ok: (value) => cb(value), err: (error) => op(error) });
	}

	/** Map an Err error into a new Err; preserve Ok unchanged. */
	public mapErr<OutputError>(
		cb: (error: If<Success, never, E>) => OutputError,
	): Result<T, OutputError, Success> {
		// @ts-expect-error Complex types
		return this.match({ ok: returnThis, err: (error) => err(cb(error)) });
	}

	/** Replace an Err with the Result returned by the callback; preserve Ok unchanged. */
	public mapErrInto<OutputResult extends AnyResult>(
		cb: (error: If<Success, never, E>) => OutputResult,
	): If<Success, Ok<T>, OutputResult> {
		return this.match({ ok: returnThis, err: (error) => cb(error) });
	}

	/** Call the callback for Ok, ignore its return value, and return this Result. */
	public inspect(cb: (value: T) => unknown): this {
		if (this.isOk()) cb(this[ValueProperty]);
		return this;
	}

	/** Await the callback for Ok, then return this Result. Callback errors reject. */
	public async inspectAsync(
		cb: (value: T) => Awaitable<unknown>,
	): Promise<this> {
		if (this.isOk()) await cb(this[ValueProperty]);
		return this;
	}

	/** Call the callback for Err, ignore its return value, and return this Result. */
	public inspectErr(cb: (error: E) => unknown): this {
		if (this.isErr()) cb(this[ValueProperty]);
		return this;
	}

	/** Await the callback for Err, then return this Result. Callback errors reject. */
	public async inspectErrAsync(
		cb: (error: E) => Awaitable<unknown>,
	): Promise<this> {
		if (this.isErr()) await cb(this[ValueProperty]);
		return this;
	}

	/** Yield the Ok value once, or yield nothing for Err. */
	public *iter(): Generator<T> {
		if (this.isOk()) yield this[ValueProperty];
	}

	/**
	 * Return the Ok value.
	 * @param message - Message for the ResultError thrown when this is Err.
	 */
	public expect(message: string): If<Success, T, never> {
		if (this.isErr()) throw new ResultError(message, this[ValueProperty]);
		return this[ValueProperty] as If<Success, T, never>;
	}

	/**
	 * Return the Err error.
	 * @param message - Message for the ResultError thrown when this is Ok.
	 */
	public expectErr(message: string): If<Success, never, E> {
		if (this.isOk()) throw new ResultError(message, this[ValueProperty]);
		return this[ValueProperty] as If<Success, never, E>;
	}

	/** Return the Ok value, or throw a ResultError retaining the Err error. */
	public unwrap(): If<Success, T, never> {
		if (this.isErr())
			throw new ResultError("Unwrap failed", this[ValueProperty]);
		return this[ValueProperty] as If<Success, T, never>;
	}

	/** Return the Err error, or throw a ResultError retaining the Ok value. */
	public unwrapErr(): If<Success, never, E> {
		if (this.isOk())
			throw new ResultError("Unwrap failed", this[ValueProperty]);
		return this[ValueProperty] as If<Success, never, E>;
	}

	/** Return the Ok value, or the supplied default for Err. */
	public unwrapOr<OutputValue>(
		defaultValue: OutputValue,
	): If<Success, T, OutputValue> {
		return this.match({ ok: (value) => value, err: () => defaultValue });
	}

	/** Return the Ok value, or call op with the Err error and return its result. */
	public unwrapOrElse<OutputValue>(
		op: (error: E) => OutputValue,
	): If<Success, T, OutputValue> {
		return this.match({ ok: (value) => value, err: (error) => op(error) });
	}

	/** Return the Ok value, or throw the Err value itself without wrapping it. */
	public unwrapRaw(): If<Success, T, never> {
		if (this.isErr()) throw this[ValueProperty];
		// @ts-expect-error Complex types
		return this[ValueProperty] as T;
	}

	/**
	 * Delegate with yield* inside safeTry. Ok returns its value; Err yields itself to stop the generator early.
	 * @throws ResultError if an Err generator is resumed outside safeTry.
	 */
	public *unwrapSafe(): Generator<Err<E>, T> {
		if (this.isOk()) {
			return this[ValueProperty];
		}

		yield this as unknown as Err<E>;
		throw new ResultError(
			"Should not be used outside of a safe try generator",
			this[ValueProperty],
		);
	}

	/** Return the supplied Result for Ok; otherwise return this Err. */
	public and<OutputResult extends AnyResult>(
		result: OutputResult,
	): If<Success, OutputResult, Err<E>> {
		return this.match({ ok: () => result, err: returnThis });
	}

	/** Call cb with the Ok value and return its Result; otherwise return this Err. */
	public andThen<OutputResult extends AnyResult>(
		cb: (value: T) => OutputResult,
	): OutputResult {
		// @ts-expect-error Complex types
		return this.match({ ok: (value) => cb(value), err: returnThis });
	}

	/** Keep this Ok, or return the supplied Result for Err. */
	public or<OutputResult extends AnyResult>(
		result: OutputResult,
	): If<Success, Ok<T>, OutputResult> {
		return this.match({ ok: returnThis, err: () => result });
	}

	/** Keep this Ok, or call cb with the Err error and return its Result. */
	public orElse<OutputResult extends AnyResult>(
		cb: (error: E) => OutputResult,
	): If<Success, Ok<T>, OutputResult> {
		return this.match({ ok: returnThis, err: (error) => cb(error) });
	}

	/** Check whether this is Ok with a value strictly equal to the supplied value. Objects compare by identity. */
	public contains<const Value extends T>(
		this: Ok<T, E>,
		value: Value,
	): this is Ok<Value>;
	/** Check whether this is Ok with a value strictly equal to the supplied value. Objects compare by identity. */
	public contains(this: Err<E, T>, value: unknown): false;
	/** Check whether this is Ok with a value strictly equal to the supplied value. Objects compare by identity. */
	public contains(value: unknown): boolean {
		return this.isOkAnd((inner) => inner === value);
	}

	/** Check whether this is Err with an error strictly equal to the supplied error. Objects compare by identity. */
	public containsErr(this: Ok<T, E>, error: unknown): false;
	/** Check whether this is Err with an error strictly equal to the supplied error. Objects compare by identity. */
	public containsErr<const Value extends E>(
		this: Err<E, T>,
		error: Value,
	): this is Err<Value>;
	/** Check whether this is Err with an error strictly equal to the supplied error. Objects compare by identity. */
	public containsErr(error: unknown): boolean {
		return this.isErrAnd((inner) => inner === error);
	}

	/** Turn Ok(Some(value)) into Some(Ok(value)), Ok(None) into None, and Err into Some(Err). */
	public transpose<InnerValue>(
		this: Result<Option<InnerValue>, E, Success>,
	): If<Success, Option<Ok<InnerValue>>, Some<Err<E>>> {
		return this.match({
			ok: (value) => value.map((value) => ok(value)),
			err() {
				return some(this);
			},
		});
	}

	/** Remove one nested Result layer from Ok; preserve Err unchanged. */
	public flatten<InnerResult extends AnyResult>(
		this: Result<InnerResult, E, Success>,
	): If<Success, InnerResult, Err<E>> {
		return this.match({ ok: (value) => value, err: returnThis });
	}

	/** Return the stored value or error without checking the branch. */
	public intoOkOrErr(): If<Success, T, E> {
		return this[ValueProperty];
	}

	/** Await the stored value or error and wrap it in the same branch. A rejected inner promise rejects the returned promise. */
	public intoPromise(): Promise<If<Success, Ok<Awaited<T>>, Err<Awaited<E>>>> {
		// @ts-expect-error Complex types
		return this.match<Ok<Awaited<T>>, Err<Awaited<E>>>({
			// @ts-expect-error Complex types
			ok: async (value) => ok(await value), // NOSONAR
			// @ts-expect-error Complex types
			err: async (error) => err(await error), // NOSONAR
		});
	}

	/** Check branch equality and strict equality of the stored values. Objects compare by identity. */
	public eq<OtherValue, OtherError, OtherSuccess extends boolean>(
		other: Result<OtherValue, OtherError, OtherSuccess>,
	): this is this & Result<OtherValue, OtherError, OtherSuccess> {
		const value: unknown = this[ValueProperty];
		return this.isOk() === other.isOk() && value === other[ValueProperty];
	}

	/** Return the opposite of eq. */
	public ne(other: AnyResult): boolean {
		return !this.eq(other);
	}

	/** Call the matching branch with its stored value and this Result as the callback’s this value. Return its result directly. */
	public match<OkValue, ErrValue>(branches: {
		/** Called for Ok with its value and the Ok Result as this. */
		ok(this: Ok<T>, value: If<Success, T, never>): OkValue;
		/** Called for Err with its error and the Err Result as this. */
		err(this: Err<E>, error: If<Success, never, E>): ErrValue;
	}): If<Success, OkValue, ErrValue>;
	/** Call the matching callback with its stored value and this Result as its this value. */
	public match<OkValue, ErrValue>(
		this: Ok<T, E> | Err<E, T>,
		branches: {
			ok(this: Ok<T>, value: T): OkValue;
			err(this: Err<E>, error: E): ErrValue;
		},
	): OkValue | ErrValue {
		// The absent branch has no stored value; erase only that branch's type.
		return this.isOk()
			? branches.ok.call(this as unknown as Ok<T>, this[ValueProperty])
			: branches.err.call(this as unknown as Err<E>, this[ValueProperty]);
	}

	/** Yield the Ok value once, or yield nothing for Err. */
	public [Symbol.iterator](): Generator<T> {
		return this.iter();
	}

	/** Ok or Err, used by Object.prototype.toString. */
	public get [Symbol.toStringTag](): If<Success, "Ok", "Err"> {
		return this.match({ ok: () => "Ok", err: () => "Err" });
	}

	/** This function, in combination with `[$]`, is intended to emulate Rust's ? operator. */
	public get [UnwrapSafeProperty](): Generator<Err<E>, T> {
		return this.unwrapSafe();
	}

	/** Create Ok(value). Omitting value stores undefined. */
	public static ok<T = undefined, E = never>(this: void, value?: T): Ok<T, E>;
	/** Create Ok(value). Omitting value stores undefined. */
	public static ok<T, E = never>(this: void, value: T): Ok<T, E> {
		return new Result<T, E, true>(value, true);
	}

	/** Create Err(value). Omitting value stores undefined. */
	public static err<E = undefined, T = never>(this: void, value?: E): Err<E, T>;
	/** Create Err(value). Omitting value stores undefined. */
	public static err<E, T = never>(this: void, value: E): Err<E, T> {
		return new Result<T, E, false>(value, false);
	}

	/** Recognize a Result, including compatible instances from another copy of the library. */
	public static [Symbol.hasInstance](instance: unknown): boolean {
		return (
			typeof instance === "object" &&
			instance !== null &&
			ValueProperty in instance &&
			SuccessProperty in instance
		);
	}

	/** Recognize a Result, including compatible instances from another copy of the library.
	 * @deprecated Use {@link Result.isResult} instead. */
	public static is(instance: unknown): instance is AnyResult {
		return Result[Symbol.hasInstance](instance);
	}

	/** Recognize a Result, including compatible instances from another copy of the library. */
	public static isResult(instance: unknown): instance is AnyResult {
		return Result[Symbol.hasInstance](instance);
	}

	/** Resolve a value, existing Result, or synchronous callback into a Result. Thrown values become Err; promises are not awaited. */
	public static from<T, E = unknown>(
		this: void,
		op: ResultResolvable<T, E> | (() => ResultResolvable<T, E>),
	): Result<T, E> {
		try {
			return resolve(isFunction(op) ? op() : op);
		} catch (error) {
			return err(error as E);
		}
	}

	/** Await a value, existing Result, or callback result. Thrown values and rejected promises become Err. */
	public static async fromAsync<T, E = unknown>(
		this: void,
		op:
			| Awaitable<ResultResolvable<T, E>>
			| (() => Awaitable<ResultResolvable<T, E>>),
	): Promise<Result<T, E>> {
		try {
			return resolve(await (isFunction(op) ? op() : op));
		} catch (error) {
			return err(error as E);
		}
	}

	/** Collect Ok values in input order, returning the first Err. Empty input returns Ok([]). */
	public static all<const Entries extends readonly AnyResult[]>(
		this: void,
		results: Entries,
	): Result<UnwrapOkArray<Entries>, UnwrapErrArray<Entries>[number]> {
		const values: unknown[] = [];
		for (const result of results) {
			if (result.isErr())
				return result as unknown as Err<UnwrapErrArray<Entries>[number]>;

			values.push(result[ValueProperty]);
		}

		return ok(values as UnwrapOkArray<Entries>);
	}

	/** Return the first Ok, or Err with all errors in input order. Empty input returns Err([]). */
	public static any<const Entries extends readonly AnyResult[]>(
		this: void,
		results: Entries,
	): Result<UnwrapOk<Entries[number]>, UnwrapErrArray<Entries>> {
		const errors: unknown[] = [];
		for (const result of results) {
			if (result.isOk())
				return result as unknown as Ok<UnwrapOk<Entries[number]>>;

			errors.push(result[ValueProperty]);
		}

		return err(errors as UnwrapErrArray<Entries>);
	}

	/**
	 * Run a generator until its first yielded Err or returned Result. Use yield* with unwrapSafe(), or with $async for
	 * promised Results.
	 * @param body - Synchronous or asynchronous generator. The async form returns a promise.
	 * @returns The first yielded error Result or final returned Result. Thrown generator errors are not captured.
	 */
	public static safeTry<T, E>(
		body: (options: SafeTryOptions) => Generator<Err<E>, Result<T, E>>,
	): Result<T, E>;

	/**
	 * Run a generator until its first yielded Err or returned Result. Use yield* with unwrapSafe(), or with $async for
	 * promised Results.
	 * @param body - Synchronous or asynchronous generator. The async form returns a promise.
	 * @returns The first yielded error Result or final returned Result. Thrown generator errors are not captured.
	 */
	public static safeTry<T, E>(
		body: (options: SafeTryOptions) => AsyncGenerator<Err<E>, Result<T, E>>,
	): Promise<Result<T, E>>;
	/**
	 * Run a generator until its first yielded Err or returned Result. Use yield* with unwrapSafe(), or with $async for
	 * promised Results.
	 * @param body - Synchronous or asynchronous generator. The async form returns a promise.
	 * @returns The first yielded error Result or final returned Result. Thrown generator errors are not captured.
	 */
	public static safeTry<T, E>(
		body:
			| ((options: SafeTryOptions) => Generator<Err<E>, Result<T, E>>)
			| ((options: SafeTryOptions) => AsyncGenerator<Err<E>, Result<T, E>>),
	): Result<T, E> | Promise<Result<T, E>> {
		const n = body({ $: UnwrapSafeProperty, $async: unwrapSafeAsync }).next();
		if (n instanceof Promise) {
			return n.then((r) => r.value);
		}

		return n.value;
	}
}

/** Types and helpers for {@link Result}. */
export declare namespace Result {
	/** Result whose branch is known to hold a successful value. */
	export type Ok<T, E = never> = Result<T, E, true>;
	/** Result whose branch is known to hold an error. */
	export type Err<E, T = never> = Result<T, E, false>;
	/** Result with unrestricted value and error types. */
	export type Any = Result<unknown, unknown>;
	/** Value or existing Result accepted by Result.from. */
	export type Resolvable<T, E = never, Success extends boolean = boolean> =
		T | Result<T, E, Success>;
	/** Extract the Ok value type, or never when no Ok branch exists. */
	export type UnwrapOk<T extends AnyResult> =
		T extends Ok<infer S, unknown> ? S : never;
	/** Extract the Err error type, or never when no Err branch exists. */
	export type UnwrapErr<T extends AnyResult> =
		T extends Err<infer S, unknown> ? S : never;

	/** Map a Result tuple or array to its Ok value types. */
	export type UnwrapOkArray<T extends readonly AnyResult[] | []> = {
		-readonly [P in keyof T]: UnwrapOk<T[P]>;
	};
	/** Map a Result tuple or array to its Err error types. */
	export type UnwrapErrArray<T extends readonly AnyResult[] | []> = {
		-readonly [P in keyof T]: UnwrapErr<T[P]>;
	};
}

export const { ok, err } = Result;

function resolve<T, E>(value: Result.Resolvable<T, E>): Result<T, E> {
	return Result.isResult(value) ? value : ok(value);
}

async function* unwrapSafeAsync<T, E>(
	result: Promise<Result<T, E>>,
): AsyncGenerator<Err<E>, T> {
	const _result = await result;
	return yield* _result.unwrapSafe();
}

/** Value or existing Result accepted by Result.from. */
export type ResultResolvable<
	T,
	E = never,
	Success extends boolean = boolean,
> = Result.Resolvable<T, E, Success>;

/** Result whose branch is known to be successful. */
export type Ok<T, E = never> = Result.Ok<T, E>;
/** Result whose branch is known to be an error. */
export type Err<E, T = never> = Result.Err<E, T>;
/** Result with unrestricted value and error types. */
export type AnyResult = Result.Any;

/** Extract a Result’s Ok value type. */
export type UnwrapOk<T extends AnyResult> = Result.UnwrapOk<T>;
/** Extract a Result’s Err error type. */
export type UnwrapErr<T extends AnyResult> = Result.UnwrapErr<T>;

/** Map Result entries to their Ok value types. */
export type UnwrapOkArray<T extends readonly AnyResult[] | []> =
	Result.UnwrapOkArray<T>;
/** Map Result entries to their Err error types. */
export type UnwrapErrArray<T extends readonly AnyResult[] | []> =
	Result.UnwrapErrArray<T>;

/** Helpers passed to a safeTry generator. */
export interface SafeTryOptions {
	/** Symbol selecting a Result’s safe-unwrapping generator, for yield* result[$]. */
	$: typeof UnwrapSafeProperty;
	/** Await a promised Result and delegate its safe unwrap. Use yield* $async(promise) inside an async safeTry body. */
	$async: <T, E>(result: Promise<Result<T, E>>) => AsyncGenerator<Err<E>, T>;
}
