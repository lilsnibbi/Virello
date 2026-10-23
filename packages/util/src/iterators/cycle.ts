import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Yield input once while saving it, then repeat the saved values indefinitely. Empty input ends immediately; the first
 * pass is retained in memory.
 */
export function* cycle<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): IterableIterator<ElementType> {
	const results = [] as ElementType[];
	for (const element of toIterableIterator(iterable)) {
		yield element;
		results.push(element);
	}

	while (results.length > 0) {
		for (const element of results) {
			yield element;
		}
	}
}
