import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/** Consume the input and return its final value, or undefined for empty input. */
export function last<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): ElementType | undefined {
	let last: ElementType | undefined;
	for (const value of toIterableIterator(iterable)) {
		last = value;
	}

	return last;
}
