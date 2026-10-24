import { isObject } from "../guards/isObject";

/** Convert an object to a tuple */
export function objectToTuples<T extends object>(
	obj: T,
	prefix = "",
): [keyof T, T[keyof T]][] {
	const entries: [keyof T, T[keyof T]][] = [];

	for (const [key, value] of Object.entries(obj)) {
		if (isObject(value)) {
			entries.push(...objectToTuples(value, `${prefix}${key}.`));
		} else {
			entries.push([`${prefix}${key}` as keyof T, value as T[keyof T]]);
		}
	}

	return entries;
}
