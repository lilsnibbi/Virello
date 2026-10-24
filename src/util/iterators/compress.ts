import { from, type IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/** Lazily yield input values whose corresponding selector is truthy. Stop when the input or selector source ends. */
export function* compress<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	selectors: IterableResolvable<boolean>,
): IterableIterator<ElementType> {
	const resolvedSelectors = from(selectors);
	for (const resolvedIterableResult of toIterableIterator(iterable)) {
		const selectorResult = resolvedSelectors.next();
		if (selectorResult.done) {
			return;
		}

		if (selectorResult.value) {
			yield resolvedIterableResult;
		}
	}
}
