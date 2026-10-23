import type { IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Lazily transform each value with callbackFn(value, zeroBasedIndex). Results are yielded without awaiting promises;
 * callback errors propagate.
 */
export function* map<const ElementType, const MappedType>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (element: ElementType, index: number) => MappedType,
): IterableIterator<MappedType> {
	callbackFn = assertFunction(callbackFn);

	let index = 0;
	for (const element of toIterableIterator(iterable)) {
		yield callbackFn(element, index++);
	}
}
