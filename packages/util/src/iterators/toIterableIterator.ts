import { from, type IterableResolvable } from "./from";
import { makeIterableIterator } from "./shared/_makeIterableIterator";

/** Get a synchronous iterable iterator, wrapping a bare iterator when needed. The source is not copied; reads consume it. */
export function toIterableIterator<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): IterableIterator<ElementType> {
	const resolvedIterable = from(iterable);
	if (Symbol.iterator in resolvedIterable) {
		return resolvedIterable;
	}

	return makeIterableIterator(() => resolvedIterable.next());
}
