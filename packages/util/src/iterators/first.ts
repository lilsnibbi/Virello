import { from, type IterableResolvable } from "./from";

/** Read the next iterator result’s value. Normally undefined when exhausted; this helper does not inspect the done flag. */
export function first<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): ElementType | undefined {
	return from(iterable).next().value;
}
