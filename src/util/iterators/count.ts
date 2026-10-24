import { from, type IterableResolvable } from "./from";

/** Consume the entire source and return the number of values read. */
export function count<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): number {
	let count = 0;
	const resolvedIterable = from(iterable);
	while (!resolvedIterable.next().done) {
		count++;
	}

	return count;
}
