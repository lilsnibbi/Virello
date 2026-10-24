import { from, type IterableResolvable } from "./from";
import { assertPositive } from "./shared/_assertPositive";
import { makeIterableIterator } from "./shared/_makeIterableIterator";
import { toIntegerOrInfinityOrThrow } from "./shared/_toIntegerOrInfinityOrThrow";

/**
 * Yield every step-th value, starting with the first. Each next() also consumes the skipped values. Step is truncated and
 * must be positive; invalid numeric inputs throw.
 */
export function stepBy<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	step: number,
): IterableIterator<ElementType> {
	step = assertPositive(toIntegerOrInfinityOrThrow(step), step);

	const iterator = from(iterable);
	return makeIterableIterator<ElementType>(() => {
		const result = iterator.next();
		if (result.done) {
			return { done: true, value: undefined };
		}

		for (let i = 0; i < step - 1; i++) {
			const result = iterator.next();
			if (result.done) break;
		}

		return { done: false, value: result.value };
	});
}
