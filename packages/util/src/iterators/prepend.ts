import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/** Lazily yield each additional source in argument order, followed by the first source. */
export function* prepend<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	...iterables: IterableResolvable<ElementType>[]
): IterableIterator<ElementType> {
	for (const iterable of iterables) {
		yield* toIterableIterator(iterable);
	}

	yield* toIterableIterator(iterable);
}
