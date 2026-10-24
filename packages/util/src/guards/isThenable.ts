import { isFunction } from "./isFunction";

/** Object with callable then and catch members. */
export interface Thenable {
	/** Callable continuation member. */
	then: (...args: never[]) => unknown;
	/** Callable rejection handler member. */
	catch: (...args: never[]) => unknown;
}

function hasThen(input: { then?: (...args: never[]) => unknown }): boolean {
	return Reflect.has(input, "then") && isFunction(input.then);
}

function hasCatch(input: { catch?: (...args: never[]) => unknown }): boolean {
	return Reflect.has(input, "catch") && isFunction(input.catch);
}

/**
 * Check for a native Promise or a non-null object with callable then and catch members. Promise.prototype itself is
 * excluded.
 * @param input - Value to inspect.
 * @returns Whether the supported promise-like shape matches.
 */
export function isThenable(input: unknown): input is Thenable {
	if (typeof input !== "object" || input === null) return false;
	return (
		input instanceof Promise ||
		(input !== Promise.prototype && hasThen(input) && hasCatch(input))
	);
}
