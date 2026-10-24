import { compareBy } from "./compareBy";
import type { IterableResolvable } from "./from";
import type { LexicographicComparison } from "./shared/_compare";
import { defaultCompare } from "./shared/comparators";

/**
 * Compare two sources value by value using string ordering. Return -1, 0, or 1; a shared prefix sorts before a longer
 * source. Undefined sorts after defined values.
 */
export function compare<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	other: IterableResolvable<ElementType>,
): LexicographicComparison {
	return compareBy(iterable, other, defaultCompare);
}
