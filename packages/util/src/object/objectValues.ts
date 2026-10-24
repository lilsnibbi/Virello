/**
 * Return an object’s own enumerable string values with its declared key/value types.
 * @param obj - Source object.
 * @returns A new array; symbol keys are excluded.
 */
export function objectValues<T extends object>(
	obj: T,
): T extends ArrayLike<infer Values> ? Values[] : T[keyof T][] {
	return Object.values(obj) as T extends ArrayLike<infer Values>
		? Values[]
		: T[keyof T][];
}
