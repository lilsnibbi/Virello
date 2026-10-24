import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import { toIterableIterator } from "./toIterableIterator";

/** Consume input, calling callbackFn(value, zeroBasedIndex) for each value. Callback results are ignored and promises are not awaited. */
export function forEach<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => void,
): void {
	callbackFn = assertFunction(callbackFn);

	let index = 0;
	for (const element of toIterableIterator(iterable)) {
		callbackFn(element, index++);
	}
}
