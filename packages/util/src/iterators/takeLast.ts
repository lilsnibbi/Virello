import { empty } from "./empty";
import type { IterableResolvable } from "./from";
import { assertNotNegative } from "./shared/_assertNotNegative";
import { makeIterableIterator } from "./shared/_makeIterableIterator";
import { toIntegerOrInfinityOrThrow } from "./shared/_toIntegerOrInfinityOrThrow";
import { toArray } from "./toArray";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Consume input into an array and yield its final count values. Count is truncated and must be nonnegative. Zero reads
 * nothing; Infinity returns the source iterator directly.
 */
export function takeLast<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	count: number,
): IterableIterator<ElementType> {
	count = assertNotNegative(toIntegerOrInfinityOrThrow(count), count);
	if (count === 0) return empty();
	if (count === Number.POSITIVE_INFINITY) return toIterableIterator(iterable);

	const array = toArray(iterable);
	let i = Math.max(0, array.length - count);
	return makeIterableIterator<ElementType>(() => {
		if (i >= array.length) {
			return { done: true, value: undefined };
		}

		return { done: false, value: array[i++] };
	});
}
