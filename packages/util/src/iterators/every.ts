import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Test values with callbackFn(value, zeroBasedIndex), stopping at the first false result. Empty input returns true. A
 * type-guard callback narrows the overload’s type. Callback errors propagate.
 */
export function every<
	const ElementType,
	const FilteredType extends ElementType,
>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => element is FilteredType,
): iterable is IterableIterator<FilteredType>;
/**
 * Test values with callbackFn(value, zeroBasedIndex), stopping at the first false result. Empty input returns true. A
 * type-guard callback narrows the overload’s type. Callback errors propagate.
 */
export function every<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => boolean,
): boolean;
/**
 * Test values with callbackFn(value, zeroBasedIndex), stopping at the first false result. Empty input returns true. A
 * type-guard callback narrows the overload’s type. Callback errors propagate.
 */
export function every<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => boolean,
) {
	callbackFn = assertFunction(callbackFn);

	let index = 0;
	for (const value of toIterableIterator(iterable)) {
		if (!callbackFn(value, index++)) return false;
	}

	return true;
}
