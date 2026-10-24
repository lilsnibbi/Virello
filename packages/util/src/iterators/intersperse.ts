import { from, type IterableResolvable } from "./from";
import { makeIterableIterator } from "./shared/_makeIterableIterator";

/** Lazily insert separator between input values. Empty and single-value sources receive no separator. */
export function intersperse<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	separator: ElementType,
): IterableIterator<ElementType> {
	let started = false;
	let nextItem: ElementType;
	let nextItemTaken = false;

	const iterator = from(iterable);
	return makeIterableIterator<ElementType>(() => {
		if (started) {
			if (nextItemTaken) {
				nextItemTaken = false;
				return { done: false, value: nextItem };
			}

			const result = iterator.next();
			if (result.done) {
				return { done: true, value: undefined };
			}

			nextItem = result.value;
			nextItemTaken = true;
			return { done: false, value: separator };
		}

		started = true;
		return iterator.next();
	});
}
