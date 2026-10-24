import { from, type IterableResolvable } from "./from";
import { repeat } from "./repeat";
import { assertNotNegative } from "./shared/_assertNotNegative";
import { makeIterableIterator } from "./shared/_makeIterableIterator";
import { toIntegerOrThrow } from "./shared/_toIntegerOrThrow";
import { toArray } from "./toArray";

/**
 * Create count independent iterators over one source. All pulled values are retained in shared memory, so uneven readers
 * can grow the buffer. Count is truncated and must be finite and nonnegative.
 */
export function tee<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	count: number,
): IterableIterator<ElementType>[] {
	count = assertNotNegative(toIntegerOrThrow(count), count);
	if (count === 0) return [];

	const entries = [] as ElementType[];
	const indexes = toArray(repeat(0, count));
	const resolvedIterable = from(iterable);

	const iterables = [] as IterableIterator<ElementType>[];
	for (let i = 0; i < count; i++) {
		const iterable = makeIterableIterator<ElementType>(() => {
			if (indexes[i] >= entries.length) {
				const result = resolvedIterable.next();
				if (result.done) {
					return { done: true, value: undefined };
				}

				entries.push(result.value);
			}

			return { done: false, value: entries[indexes[i]++] };
		});

		iterables.push(iterable);
	}

	return iterables;
}
