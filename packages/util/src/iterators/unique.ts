import type { IterableResolvable } from "./from";
import { union } from "./union";

/** Lazily remove duplicates using Set equality, preserving first-seen order and retaining seen values in memory. */
export function unique<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): IterableIterator<ElementType> {
	// The union of a single iterator is the iterator itself, with duplicates removed.
	return union(iterable);
}
