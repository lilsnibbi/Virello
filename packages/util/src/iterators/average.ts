import type { IterableResolvable } from "./from";
import { map } from "./map";
import {
	type NumberResolvable,
	toNumberOrThrow,
} from "./shared/_toNumberOrThrow";

/**
 * Consume numeric-coercible values and return their mean, or null for empty input. NaN, undefined, symbols, and bigints
 * reject; conversion errors propagate.
 */
export function average(
	iterable: IterableResolvable<NumberResolvable>,
): number | null {
	let sum = 0;
	let total = 0;
	for (const value of map(iterable, toNumberOrThrow)) {
		sum += value;
		total++;
	}

	return total === 0 ? null : sum / total;
}
