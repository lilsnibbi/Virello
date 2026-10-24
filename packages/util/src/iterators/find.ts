import { filter } from "./filter";
import { first } from "./first";
import type { IterableResolvable } from "./from";

/**
 * Return the first value accepted by callbackFn(value, zeroBasedIndex), or undefined. A type-guard callback narrows the
 * result. Callback errors propagate.
 */
export function find<const ElementType, const FilteredType extends ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => element is FilteredType,
): FilteredType | undefined;
/**
 * Return the first value accepted by callbackFn(value, zeroBasedIndex), or undefined. A type-guard callback narrows the
 * result. Callback errors propagate.
 */
export function find<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => boolean,
): ElementType | undefined;
/**
 * Return the first value accepted by callbackFn(value, zeroBasedIndex), or undefined. A type-guard callback narrows the
 * result. Callback errors propagate.
 */
export function find<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => boolean,
): ElementType | undefined {
	return first(filter(iterable, callbackFn));
}
