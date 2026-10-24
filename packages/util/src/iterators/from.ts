/**
 * Get an iterator from an iterable object, iterator object, or string. Existing iterators are reused when no iterable
 * method is present.
 * @param value - Synchronous source.
 * @returns Its iterator.
 * @throws TypeError when the value cannot be converted.
 */
export function from<
	const ElementType,
	const ResolvableType extends IterableResolvable<ElementType>,
>(value: ResolvableType): IterableResolved<ResolvableType>;
/**
 * Get an iterator from an iterable object, iterator object, or string. Existing iterators are reused when no iterable
 * method is present.
 * @param value - Synchronous source.
 * @returns Its iterator.
 * @throws TypeError when the value cannot be converted.
 */
export function from(value: unknown) {
	if (typeof value === "object" && value !== null) {
		if (Symbol.iterator in value) {
			const iterator = value[Symbol.iterator];
			if (typeof iterator === "function") return iterator.call(value);
		}

		if ("next" in value && typeof value.next === "function") {
			return value;
		}
	}

	if (typeof value === "string") {
		return value[Symbol.iterator]();
	}

	throw new TypeError(`${String(value)} cannot be converted to an iterable`);
}

/** Synchronous iterable or iterator accepted by iterator helpers. */
export type IterableResolvable<ElementType> =
	Iterable<ElementType> | Iterator<ElementType> | IterableIterator<ElementType>;

/** Iterator type obtained from a supported iterable or iterator. */
export type IterableResolved<Type> =
	Type extends IterableIterator<infer Output>
		? IterableIterator<Output>
		: Type extends Iterable<infer Output>
			? Iterator<Output>
			: Type extends Iterator<infer Output>
				? Iterator<Output>
				: never;
