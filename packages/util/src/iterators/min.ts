import type { IterableResolvable } from "./from";
import { minBy } from "./minBy";
import { defaultCompare } from "./shared/comparators";

/** Consume input and return the least value by string ordering, or null when empty. Equal values choose the last; undefined sorts last. */
export function min<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): ElementType | null {
	return minBy(iterable, defaultCompare);
}
