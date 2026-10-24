import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Lazily skip every value for which callbackFn(value, zeroBasedIndex) is true. This implementation filters the whole
 * stream, including matches after the first false result.
 */
export function dropWhile<
	const ElementType,
	const FilteredType extends ElementType,
>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => element is FilteredType,
): IterableIterator<Exclude<ElementType, FilteredType>>;
/**
 * Lazily skip every value for which callbackFn(value, zeroBasedIndex) is true. This implementation filters the whole
 * stream, including matches after the first false result.
 */
export function dropWhile<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => boolean,
): IterableIterator<ElementType>;
/**
 * Lazily skip every value for which callbackFn(value, zeroBasedIndex) is true. This implementation filters the whole
 * stream, including matches after the first false result.
 */
export function* dropWhile<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => boolean,
): IterableIterator<ElementType> {
	callbackFn = assertFunction(callbackFn);

	let index = 0;
	for (const value of toIterableIterator(iterable)) {
		if (!callbackFn(value, index++)) {
			yield value;
		}
	}
}
