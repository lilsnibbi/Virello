import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/** Return the zero-based index of the first strictly equal value, or -1. Objects compare by identity. */
export function indexOf<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	value: ElementType,
): number {
	let index = 0;
	for (const element of toIterableIterator(iterable)) {
		if (element === value) {
			return index;
		}

		index++;
	}

	return -1;
}
