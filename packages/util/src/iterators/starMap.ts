import { type IterableResolvable } from "./from";
import { assertFunction } from "./shared/_assertFunction";
import { toIterableIterator } from "./toIterableIterator";

/**
 * Lazily spread each nested source into callbackFn arguments and yield its result. Each nested source is consumed before
 * the call; errors propagate.
 */
export function* starMap<
	const ElementType extends IterableResolvable<unknown>,
	const MappedType,
>(
	iterable: IterableResolvable<ElementType>,
	callbackFn: (...args: StarMapParameters<ElementType>) => MappedType,
): IterableIterator<MappedType> {
	callbackFn = assertFunction(callbackFn);

	for (const value of toIterableIterator(iterable)) {
		yield callbackFn(
			...([...toIterableIterator(value)] as StarMapParameters<ElementType>),
		);
	}
}

/** Callback argument tuple, or homogeneous argument list, inferred from one nested iterable. */
export type StarMapParameters<ElementType> = ElementType extends readonly [
	...infer ElementTypeEntry,
]
	? ElementTypeEntry
	: ElementType extends IterableResolvable<infer ElementType>
		? ElementType[]
		: never;
