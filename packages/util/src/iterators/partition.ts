import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Consume input into [matching, nonmatching] arrays, preserving order within each. The predicate receives each value and
 * zero-based index; errors propagate.
 */
export function partition<
	const ElementType,
	const FilteredType extends ElementType,
>(
	iterable: IterableResolvable<ElementType>,
	predicate: (value: ElementType, index: number) => value is FilteredType,
): [FilteredType[], Exclude<ElementType, FilteredType>[]];
/**
 * Consume input into [matching, nonmatching] arrays, preserving order within each. The predicate receives each value and
 * zero-based index; errors propagate.
 */
export function partition<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	predicate: (value: ElementType, index: number) => boolean,
): [ElementType[], ElementType[]];

/**
 * Consume input into [matching, nonmatching] arrays, preserving order within each. The predicate receives each value and
 * zero-based index; errors propagate.
 */
export function partition<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	predicate: (value: ElementType, index: number) => boolean,
): [ElementType[], ElementType[]] {
	predicate = assertFunction(predicate);

	const bufferLeft: ElementType[] = [];
	const bufferRight: ElementType[] = [];

	let index = 0;
	for (const value of toIterableIterator(iterable)) {
		if (predicate(value, index++)) {
			bufferLeft.push(value);
		} else {
			bufferRight.push(value);
		}
	}

	return [bufferLeft, bufferRight];
}
