/** Verify if the input is a function. */
export function isFunction(
	input: unknown,
): input is (...args: never[]) => unknown {
	return typeof input === "function";
}
