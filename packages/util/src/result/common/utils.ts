/** Value or promise-like value. */
export type Awaitable<T> = PromiseLike<T> | T;

/** Choose a type for true or false, or their union when the boolean is not known. */
export type If<
	Value extends boolean,
	TrueResult,
	FalseResult,
> = Value extends true
	? TrueResult
	: Value extends false
		? FalseResult
		: TrueResult | FalseResult;

export function isFunction<A extends readonly unknown[], R>(
	cb: (...args: A) => R,
): true;
export function isFunction(
	input: unknown,
): input is (...args: readonly never[]) => unknown;
export function isFunction(input: unknown) {
	return typeof input === "function";
}

export function isPromise<T>(input: PromiseLike<T>): true;
export function isPromise(input: unknown): input is PromiseLike<unknown>;
export function isPromise(input: unknown) {
	return (
		typeof input === "object" &&
		input !== null &&
		"then" in input &&
		typeof input.then === "function"
	);
}

export function returnThis<U>(this: U): U {
	return this;
}
