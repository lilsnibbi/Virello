import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/** Check for a value using strict equality, stopping at the first match. Objects compare by identity and NaN does not match itself. */
export function contains<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	value: ElementType,
): boolean {
	for (const element of toIterableIterator(iterable)) {
		if (element === value) return true;
	}

	return false;
}
