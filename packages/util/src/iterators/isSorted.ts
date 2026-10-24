import type { IterableResolvable } from "./from";
import { isSortedBy } from "./isSortedBy";
import { defaultCompare } from "./shared/comparators";

/** Check ascending string order, with undefined last. Empty and single-value sources pass; stops at the first descending pair. */
export function isSorted<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): boolean {
	return isSortedBy(iterable, defaultCompare);
}
