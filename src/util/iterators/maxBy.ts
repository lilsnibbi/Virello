import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import {
	type CompareByComparator,
	compareIteratorElements,
	orderingIsLess,
} from "./shared/_compare";
import { toIterableIterator } from "./toIterableIterator";

/** Consume input and return the greatest value according to comparator, or null when empty. Ties choose the last; undefined sorts last. */
export function maxBy<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	comparator: CompareByComparator<ElementType>,
): ElementType | null {
	comparator = assertFunction(comparator);

	const iterator = toIterableIterator(iterable);
	const first = iterator.next();
	if (first.done) return null;

	let maximum = first.value;
	for (const value of iterator) {
		const comparison = compareIteratorElements<ElementType>(
			value,
			maximum,
			comparator,
		);
		if (!orderingIsLess(comparison)) {
			maximum = value;
		}
	}

	return maximum;
}
