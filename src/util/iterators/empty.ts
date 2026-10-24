import { makeIterableIterator } from "./shared/_makeIterableIterator";

/** Create an iterator that immediately reports completion. */
export function empty<
	const ElementType = never,
>(): IterableIterator<ElementType> {
	return makeIterableIterator<ElementType>(() => ({
		done: true,
		value: undefined,
	}));
}
