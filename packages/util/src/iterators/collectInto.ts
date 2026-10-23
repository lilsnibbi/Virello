import type { IterableResolvable } from "./from";
import { toIterableIterator } from "./toIterableIterator";

/** Consume the source, append its values to output, and return that same array. */
export function collectInto<const ElementType>(
	iterable: IterableResolvable<ElementType>,
	output: ElementType[],
): ElementType[] {
	for (const value of toIterableIterator(iterable)) {
		output.push(value);
	}

	return output;
}
