import type { IterableResolvable } from "./from";
import { makeIterableIterator } from "./shared/_makeIterableIterator";
import { toIterableIterator } from "./toIterableIterator";

/** Wrap an iterator so every next() after its first done result also reports completion. */
export function fuse<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): IterableIterator<ElementType> {
	let ended = false;
	const iterator = toIterableIterator(iterable);
	return makeIterableIterator(() => {
		if (ended) {
			return { done: true, value: undefined };
		}

		const result = iterator.next();
		if (result.done) {
			ended = true;
		}

		return result;
	});
}
