import { collect } from "./collect";
import type { IterableResolvable } from "./from";

/** Consume the source into an array, then lazily yield its values in reverse order. */
export function* reverse<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): IterableIterator<ElementType> {
	const items = collect(iterable);
	for (let i = items.length - 1; i >= 0; i--) {
		yield items[i];
	}
}
