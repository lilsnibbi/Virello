import { from, type IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import { makeIterableIterator } from "./shared/_makeIterableIterator";

/** Lazily call callbackFn(value, zeroBasedIndex) for each value, then yield that same value. Callback errors propagate. */
export function inspect<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => void,
): IterableIterator<ElementType> {
	callbackFn = assertFunction(callbackFn);

	let index = 0;
	const iterator = from(iterable);
	return makeIterableIterator<ElementType>(() => {
		const result = iterator.next();
		if (!result.done) {
			callbackFn(result.value, index++);
		}

		return result;
	});
}
