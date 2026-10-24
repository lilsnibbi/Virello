import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Consume input into an accumulator using callbackFn(accumulator, value, zeroBasedIndex). Without an initial argument, the
 * first value becomes the accumulator; empty input then throws TypeError.
 */
export function reduce<const ElementType, const MappedType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (
		accumulator: MappedType,
		currentValue: ElementType,
		currentIndex: number,
	) => MappedType,
	...initial: [initialValue?: MappedType]
): MappedType {
	callbackFn = assertFunction(callbackFn);

	let index: number;
	let accumulator: MappedType;
	const resolvedIterable = toIterableIterator(iterable);
	if (initial.length === 0) {
		const firstValue = resolvedIterable.next();
		if (firstValue.done)
			throw new TypeError("Reduce of empty iterator with no initial value");

		index = 1;
		accumulator = firstValue.value! as MappedType;
	} else {
		index = 0;
		accumulator = initial[0]!;
	}

	for (const value of resolvedIterable) {
		accumulator = callbackFn(accumulator, value, index++);
	}

	return accumulator;
}
