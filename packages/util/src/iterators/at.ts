import { drop } from "./drop";
import { first } from "./first";
import type { IterableResolvable } from "./from";
import { assertNotNegative } from "./shared/_assertNotNegative";
import { toIntegerOrInfinityOrThrow } from "./shared/_toIntegerOrInfinityOrThrow";

/**
 * Skip to a nonnegative zero-based index and return that value, or undefined. The index is truncated; negative or NaN
 * inputs throw. Infinity returns undefined without consuming the source.
 */
export function at<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	index: number,
): ElementType | undefined {
	index = assertNotNegative(toIntegerOrInfinityOrThrow(index), index);
	return first(index === 0 ? iterable : drop(iterable, index));
}
