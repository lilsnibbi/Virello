import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import {
	type CompareByComparator,
	compareIteratorElements,
	orderingIsGreater,
} from "./shared/_compare";
import { defaultCompare } from "./shared/comparators";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Map each value to a key and return the value with the greatest key, or null when empty. Ties choose the last. Defaults
 * to string key comparison with undefined last.
 */
export function maxByKey<const ElementType, const MappedType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => MappedType,
	comparator: CompareByComparator<MappedType> = defaultCompare,
): ElementType | null {
	callbackFn = assertFunction(callbackFn);

	const iterator = toIterableIterator(iterable);
	const first = iterator.next();
	if (first.done) return null;

	let maximum = first.value;
	let maximumKey = callbackFn(maximum, 0);
	let index = 1;
	for (const value of iterator) {
		const key = callbackFn(value, index++);
		const comparison = compareIteratorElements<MappedType>(
			maximumKey,
			key,
			comparator,
		);

		if (!orderingIsGreater(comparison)) {
			maximum = value;
			maximumKey = key;
		}
	}

	return maximum;
}
