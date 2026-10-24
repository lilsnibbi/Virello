import type { IterableResolvable } from "./from";
import { toArray } from "./toArray";

/** Consume input into an array and return its sorted iterator. Uses native Array.sort; omitted compareFn uses string ordering. */
export function sorted<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	compareFn?: (a: ElementType, b: ElementType) => number,
): IterableIterator<ElementType> {
	return toArray(iterable).sort(compareFn).values();
}
