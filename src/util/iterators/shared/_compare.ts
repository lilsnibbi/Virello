/** The result of a lexicographic comparison. */
export type LexicographicComparison = -1 | 0 | 1;

/**
 * Compare two defined values: return a negative number, zero, or a positive number for ascending order. Undefined values
 * are handled before this callback.
 */
export type CompareByComparator<ElementType> = (
	x: Exclude<ElementType, undefined>,
	y: Exclude<ElementType, undefined>,
) => number;

export function compareIteratorElements<const ElementType>(
	x: ElementType | undefined,
	y: ElementType | undefined,
	comparator: CompareByComparator<ElementType>,
): number {
	// 23.1.3.30.2 CompareArrayElements (https://tc39.es/ecma262/#sec-comparearrayelements)
	if (typeof x === "undefined") {
		// 1. If x and y are both `undefined`, return +0.
		if (typeof y === "undefined") return 0;
		// 2. If x is `undefined`, return +1.
		return 1;
	}

	if (typeof y === "undefined") {
		// 3. If y is `undefined`, return -1.
		return -1;
	}

	return comparator(
		x as Exclude<ElementType, undefined>,
		y as Exclude<ElementType, undefined>,
	);
}

export function orderingIsLess(ordering: number) {
	return ordering < 0;
}

export function orderingIsEqual(ordering: number) {
	return ordering === 0;
}

export function orderingIsGreater(ordering: number) {
	return ordering > 0;
}
