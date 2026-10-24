import { compare } from "./compare";
import type { IterableResolvable } from "./from";
import { orderingIsGreater } from "./shared/_compare";

/** Compare sources in string order and return whether the first is less than or equal to the second. Undefined sorts last. */
export function lessOrEqualThan<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	other: IterableResolvable<ElementType>,
): boolean {
	const result = compare(iterable, other);
	return !orderingIsGreater(result);
}

export { lessOrEqualThan as le };
