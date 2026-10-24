import { from, type IterableResolvable } from "./from";

/** Wrap a source with one-result lookahead. Repeated peek() calls reuse the saved result until next() consumes it. */
export function peekable<const ElementType>(
	iterable: IterableResolvable<ElementType>,
): Peekable<ElementType> {
	const resolvedIterable = from(iterable);
	let peeked: IteratorResult<ElementType> | undefined;
	return {
		next() {
			if (peeked) {
				const value = peeked;
				peeked = undefined;
				return value;
			}

			return resolvedIterable.next();
		},
		peek() {
			return (peeked ??= resolvedIterable.next());
		},
		[Symbol.iterator]() {
			return this as IterableIterator<ElementType>;
		},
	};
}

/** Iterable iterator with one-result lookahead. */
export interface Peekable<T> extends IterableIterator<T> {
	/** Read and save the next result without consuming it from this wrapper. Repeated peeks return the same saved result. */
	peek(): IteratorResult<T>;
}
