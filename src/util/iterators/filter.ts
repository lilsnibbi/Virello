import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Lazily yield every value accepted by callbackFn(value, zeroBasedIndex). The full stream is filtered; a type-guard
 * callback narrows the output. Callback errors propagate.
 */
export function filter<
	const ElementType,
	const FilteredType extends ElementType,
>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => element is FilteredType,
): IterableIterator<FilteredType>;
/**
 * Lazily yield every value accepted by callbackFn(value, zeroBasedIndex). The full stream is filtered; a type-guard
 * callback narrows the output. Callback errors propagate.
 */
export function filter<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => boolean,
): IterableIterator<ElementType>;
/**
 * Lazily yield every value accepted by callbackFn(value, zeroBasedIndex). The full stream is filtered; a type-guard
 * callback narrows the output. Callback errors propagate.
 */
export function* filter<ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => boolean,
): IterableIterator<ElementType> {
	callbackFn = assertFunction(callbackFn);

	let index = 0;
	for (const value of toIterableIterator(iterable)) {
		if (callbackFn(value, index++)) yield value;
	}
}
