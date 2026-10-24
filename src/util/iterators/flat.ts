import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/** Lazily flatten one level of nested synchronous sources. */
export function* flat<const ElementType>(
	iterables: IterableResolvable<IterableResolvable<ElementType>>,
): IterableIterator<ElementType> {
	for (const value of toIterableIterator(iterables)) {
		yield* toIterableIterator(value);
	}
}
