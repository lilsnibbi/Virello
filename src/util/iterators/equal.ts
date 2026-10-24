import { equalBy } from "./equalBy";
import type { IterableResolvable } from "./from";

/** Compare values in order using strict equality and require equal lengths. Stops at the first difference. Also exported as eq. */
export function equal<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	other: IterableResolvable<ElementType>,
): boolean {
	return equalBy(iterable, other, (a, b) => a === b);
}

export { equal as eq };
