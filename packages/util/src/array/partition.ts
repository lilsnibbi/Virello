import { isFunction } from "../guards/isFunction";

/** Partitions `array` into a tuple of two arrays, where one array contains all elements that satisfies `predicate`, and the other contains all elements that do not satisfy `predicate`. */
export function partition<T>(
	array: T[],
	predicate: (value: T, index: number) => boolean,
) {
	if (!Array.isArray(array)) throw new TypeError("entries must be an array.");
	if (!isFunction(predicate))
		throw new TypeError(
			"predicate must be an function that returns a boolean value.",
		);

	const partitionOne: T[] = [];
	const partitionTwo: T[] = [];

	for (let i = 0; i < array.length; i++) {
		if (predicate(array[i], i)) {
			partitionOne.push(array[i]);
		} else {
			partitionTwo.push(array[i]);
		}
	}

	return [partitionOne, partitionTwo];
}
