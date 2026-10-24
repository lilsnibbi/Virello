import { equal } from "./equal";
import type { IterableResolvable } from "./from";

/** Return the opposite of equal, using strict value equality and matching lengths. Also exported as ne. */
export function notEqual<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	other: IterableResolvable<ElementType>,
): boolean {
	return !equal(iterable, other);
}

export { notEqual as ne };
