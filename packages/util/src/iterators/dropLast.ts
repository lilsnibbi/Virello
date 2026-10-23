import { empty } from "./empty";
import type { IterableResolvable } from "./from";
import { assertNotNegative } from "./shared/_assertNotNegative";
import { toIntegerOrInfinityOrThrow } from "./shared/_toIntegerOrInfinityOrThrow";
import { take } from "./take";
import { toArray } from "./toArray";

/**
 * Consume input into an array and yield everything except its last count values. Count is truncated and must be
 * nonnegative; Infinity yields nothing.
 */
export function dropLast<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	count: number,
): IterableIterator<ElementType> {
	count = assertNotNegative(toIntegerOrInfinityOrThrow(count), count);
	const array = toArray(iterable);
	if (array.length <= count) return empty();
	return take(array.values(), array.length - count);
}
