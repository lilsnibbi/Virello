import { chain } from "./chain";
import type { IterableResolvable } from "./from";

/** Lazily yield the first source followed by each additional source. Also exported as concat. */
export function append<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	...iterables: IterableResolvable<ElementType>[]
): IterableIterator<ElementType> {
	return chain(iterable, ...iterables);
}

export { append as concat };
