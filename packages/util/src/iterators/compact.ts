import { filter } from "./filter";
import type { IterableResolvable } from "./from";

/** Lazily remove null and undefined values; other falsy values are retained. */
export function compact<const ElementType>(
	iterable: IterableResolvable<ElementType | null | undefined>,
): IterableIterator<ElementType> {
	return filter(
		iterable,
		(value): value is ElementType => value !== null && value !== undefined,
	);
}
