import type { IterableResolvable } from "./from";
import { maxBy } from "./maxBy";
import { defaultCompare } from "./shared/comparators";

/**
 * Consume input and return the greatest value by string ordering, or null when empty. Equal values choose the last;
 * undefined sorts last.
 */
export function max<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): ElementType | null {
	return maxBy(iterable, defaultCompare);
}
