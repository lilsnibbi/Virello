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
 * Map values to keys with callbackFn(value, zeroBasedIndex), then check adjacent keys. Defaults to string comparison, with
 * undefined last.
 */
export function isSortedByKey<const ElementType, const MappedType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (a: ElementType, index: number) => MappedType,
	comparator: CompareByComparator<MappedType> = defaultCompare,
): boolean {
	callbackFn = assertFunction(callbackFn);

	const iterator = toIterableIterator(iterable);
	const result = iterator.next();
	if (result.done) return true;

	let previousKey = callbackFn(result.value, 0);
	let index = 1;
	for (const current of iterator) {
		const currentKey = callbackFn(current, index++);
		const comparison = compareIteratorElements<MappedType>(
			previousKey,
			currentKey,
			comparator,
		);
		if (orderingIsGreater(comparison)) return false;

		previousKey = currentKey;
	}

	return true;
}
