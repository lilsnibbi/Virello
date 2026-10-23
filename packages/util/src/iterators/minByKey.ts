import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import {
	type CompareByComparator,
	compareIteratorElements,
	orderingIsLess,
} from "./shared/_compare";
import { defaultCompare } from "./shared/comparators";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Map each value to a key and return the value with the least key, or null when empty. Ties choose the last. Defaults to
 * string key comparison with undefined last.
 */
export function minByKey<const ElementType, const MappedType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => MappedType,
	comparator: CompareByComparator<MappedType> = defaultCompare,
): ElementType | null {
	callbackFn = assertFunction(callbackFn);

	const iterator = toIterableIterator(iterable);
	const first = iterator.next();
	if (first.done) return null;

	let minimum = first.value;
	let minimumKey = callbackFn(minimum, 0);
	let index = 1;
	for (const value of iterator) {
		const key = callbackFn(value, index++);
		const comparison = compareIteratorElements<MappedType>(
			minimumKey,
			key,
			comparator,
		);

		if (!orderingIsLess(comparison)) {
			minimum = value;
			minimumKey = key;
		}
	}

	return minimum;
}
