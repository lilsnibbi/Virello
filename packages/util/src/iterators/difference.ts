import { filter } from "./filter";
import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Consume second into a Set, then lazily yield first values absent from that set. Duplicates in first are preserved. Also
 * exported as except and omit.
 */
export function difference<const ElementType>(
	first: IterableResolvable<ElementType>,
	second: IterableResolvable<ElementType>,
): IterableIterator<ElementType> {
	const set = new Set(toIterableIterator(second));
	return filter(first, (value) => !set.has(value));
}

export { difference as except, difference as omit };
