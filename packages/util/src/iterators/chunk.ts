import type { IterableResolvable } from "./from";
import { assertPositive } from "./shared/_assertPositive";
import { toIntegerOrThrow } from "./shared/_toIntegerOrThrow";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Lazily collect consecutive values into arrays of the requested size, including a shorter final chunk. Size is truncated;
 * nonpositive, NaN, or infinite sizes throw.
 */
export function* chunk<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	size: number,
): IterableIterator<ElementType[]> {
	size = assertPositive(toIntegerOrThrow(size), size);

	let buffer: ElementType[] = [];
	for (const element of toIterableIterator(iterable)) {
		buffer.push(element);

		if (buffer.length === size) {
			yield buffer;
			buffer = [];
		}
	}

	if (buffer.length) {
		yield buffer;
	}
}
