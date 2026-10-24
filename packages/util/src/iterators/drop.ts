import { empty } from "./empty";
import type { IterableResolvable } from "./from";
import { assertNotNegative } from "./shared/_assertNotNegative";
import { toIntegerOrInfinityOrThrow } from "./shared/_toIntegerOrInfinityOrThrow";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Immediately consume the first count values and return the remaining iterator. Count is truncated and must be
 * nonnegative; Infinity returns an empty iterator without consuming input.
 */
export function drop<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	count: number,
): IterableIterator<ElementType> {
	count = assertNotNegative(toIntegerOrInfinityOrThrow(count), count);
	const resolvedIterable = toIterableIterator(iterable);

	// If the count is 0, return the original iterable:
	if (count === 0) return resolvedIterable;
	// If the count is infinite, return an empty iterable:
	if (count === Number.POSITIVE_INFINITY) return empty();

	for (let i = 0; i < count; i++) {
		if (resolvedIterable.next().done) break;
	}

	return resolvedIterable;
}
