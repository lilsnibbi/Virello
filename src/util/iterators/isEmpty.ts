import { from, type IterableResolvable } from "./from";

/** Read one iterator result and check its done flag. A nonempty one-shot iterator loses that first value. */
export function isEmpty<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): boolean {
	return from(iterable).next().done ?? false;
}
