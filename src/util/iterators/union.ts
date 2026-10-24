import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Lazily yield each distinct value once across the sources, preserving first-seen order. Uses Set equality and retains
 * seen values in memory.
 */
export function* union<const ElementType>(
	...iterables: IterableResolvable<ElementType>[]
): IterableIterator<ElementType> {
	const seen = new Set<ElementType>();
	for (const iterator of iterables) {
		for (const value of toIterableIterator(iterator)) {
			if (!seen.has(value)) {
				seen.add(value);
				yield value;
			}
		}
	}
}
