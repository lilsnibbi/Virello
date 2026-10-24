import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import {
	type CompareByComparator,
	compareIteratorElements,
	orderingIsGreater,
} from "./shared/_compare";
import { toIterableIterator } from "./toIterableIterator";

/** Consume input and return the least value according to comparator, or null when empty. Ties choose the last; undefined sorts last. */
export function minBy<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	comparator: CompareByComparator<ElementType>,
): ElementType | null {
	comparator = assertFunction(comparator);

	const iterator = toIterableIterator(iterable);
	const first = iterator.next();
	if (first.done) return null;

	let minimum = first.value;
	for (const value of iterator) {
		const comparison = compareIteratorElements<ElementType>(
			value,
			minimum,
			comparator,
		);

		if (!orderingIsGreater(comparison)) {
			minimum = value;
		}
	}

	return minimum;
}
