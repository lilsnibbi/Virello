/**
 * Return an object’s own enumerable string [key, value] pairs with its declared key/value types.
 * @param obj - Source object.
 * @returns A new array; symbol keys are excluded.
 */
export function objectEntries<T extends object>(
	obj: T,
): T extends ArrayLike<infer Values>
	? [`${number}`, Values][]
	: [keyof T, T[keyof T]][] {
	return Object.entries(obj) as T extends ArrayLike<infer Values>
		? [`${number}`, Values][]
		: [keyof T, T[keyof T]][];
}
