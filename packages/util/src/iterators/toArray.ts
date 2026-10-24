import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/** Consume a source into a new array. */
export function toArray<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): ElementType[] {
	return [...toIterableIterator(iterable)];
}
