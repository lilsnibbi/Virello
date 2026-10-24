import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import {
	type CompareByComparator,
	compareIteratorElements,
	orderingIsGreater,
} from "./shared/_compare";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Check adjacent values with a comparator, treating undefined as last. Empty and single-value sources pass. Stops at the
 * first descending pair.
 */
export function isSortedBy<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	comparator: CompareByComparator<ElementType>,
): boolean {
	comparator = assertFunction(comparator);

	const iterator = toIterableIterator(iterable);
	const result = iterator.next();
	if (result.done) return true;

	let previous = result.value;
	for (const current of iterator) {
		const comparison = compareIteratorElements<ElementType>(
			previous,
			current,
			comparator,
		);
		if (orderingIsGreater(comparison)) return false;

		previous = current;
	}

	return true;
}
