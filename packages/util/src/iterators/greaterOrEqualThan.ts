import { compare } from "./compare";
import type { IterableResolvable } from "./from";
import { orderingIsLess } from "./shared/_compare";

/** Compare sources in string order and return whether the first is greater than or equal to the second. Undefined sorts last. */
export function greaterOrEqualThan<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	other: IterableResolvable<ElementType>,
): boolean {
	const result = compare(iterable, other);
	return !orderingIsLess(result);
}

export { greaterOrEqualThan as ge };
