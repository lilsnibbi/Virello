import { compare } from "./compare";
import type { IterableResolvable } from "./from";
import { orderingIsGreater } from "./shared/_compare";

/** Compare sources in string order and return whether the first is greater than the second. Undefined sorts last. */
export function greaterThan<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	other: IterableResolvable<ElementType>,
): boolean {
	const result = compare(iterable, other);
	return orderingIsGreater(result);
}

export { greaterThan as gt };
