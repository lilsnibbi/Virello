import { from, type IterableResolvable } from "./from";
import { assertPositive } from "./shared/_assertPositive";
import { makeIterableIterator } from "./shared/_makeIterableIterator";
import { toIntegerOrInfinityOrThrow } from "./shared/_toIntegerOrInfinityOrThrow";

/**
 * Yield overlapping arrays of count consecutive values, moving one value at a time. Short trailing windows are omitted.
 * Count is truncated and must be positive; Infinity completes no finite window.
 */
export function windows<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	count: number,
): IterableIterator<ElementType[]> {
	count = assertPositive(toIntegerOrInfinityOrThrow(count), count);

	const buffer = [] as ElementType[];
	const resolvedIterable = from(iterable);
	return makeIterableIterator<ElementType[]>(() => {
		while (buffer.length !== count) {
			const result = resolvedIterable.next();
			if (result.done) return { done: true, value: undefined };

			buffer.push(result.value);
		}

		const value = buffer.slice();
		buffer.shift();
		return { done: false, value };
	});
}
