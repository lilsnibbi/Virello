import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/** Lazily yield each supplied source in order, finishing one before starting the next. */
export function* chain<const ElementType>(
	...iterables: IterableResolvable<ElementType>[]
): IterableIterator<ElementType> {
	for (const iterable of iterables) {
		yield* toIterableIterator(iterable);
	}
}
