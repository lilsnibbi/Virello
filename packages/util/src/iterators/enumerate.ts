import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/** Lazily yield [zeroBasedIndex, value] pairs. */
export function* enumerate<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): IterableIterator<[number, ElementType]> {
	let index = 0;
	for (const value of toIterableIterator(iterable)) {
		yield [index++, value];
	}
}
