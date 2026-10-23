import { empty } from "./empty";
import { from, type IterableResolvable } from "./from";
import { assertNotNegative } from "./shared/_assertNotNegative";
import { makeIterableIterator } from "./shared/_makeIterableIterator";
import { toIntegerOrInfinityOrThrow } from "./shared/_toIntegerOrInfinityOrThrow";

/**
 * Lazily read at most count values without copying them. Count is truncated and must be nonnegative; 0 reads nothing and
 * Infinity keeps the entire source.
 */
export function take<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	count: number,
): IterableIterator<ElementType> {
	count = assertNotNegative(toIntegerOrInfinityOrThrow(count), count);
	if (count === 0) return empty();

	let i = 0;
	const resolvedIterable = from(iterable);
	return makeIterableIterator<ElementType>(() => {
		if (i >= count) return { done: true, value: undefined };
		i++;
		return resolvedIterable.next();
	});
}
