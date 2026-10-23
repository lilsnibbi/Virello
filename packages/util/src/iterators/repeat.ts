import { assertNotNegative } from "./shared/_assertNotNegative";
import { makeIterableIterator } from "./shared/_makeIterableIterator";
import { toNumberOrThrow } from "./shared/_toNumberOrThrow";

/**
 * Yield the same value repeatedly without copying it. Nonnegative count is required; fractional counts round up in
 * practice and Infinity repeats forever.
 */
export function repeat<const ElementType>(
	value: ElementType,
	count: number,
): IterableIterator<ElementType> {
	count = assertNotNegative(toNumberOrThrow(count), count);

	let i = 0;
	return makeIterableIterator<ElementType>(() => {
		if (i >= count) return { done: true, value: undefined };
		i++;
		return { done: false, value };
	});
}
