import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import { toIterableIterator } from "./toIterableIterator";

/** Return the zero-based index of the first value accepted by callbackFn, or -1. Callback errors propagate. */
export function findIndex<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => boolean,
): number {
	callbackFn = assertFunction(callbackFn);

	let index = 0;
	for (const element of toIterableIterator(iterable)) {
		if (callbackFn(element, index)) {
			return index;
		}

		index++;
	}

	return -1;
}
