import type { IterableResolvable } from "./from";
import { map } from "./map";
import { toNumberOrThrow } from "./shared/_toNumberOrThrow";

/** Consume numeric values and return their product, starting at 1. Invalid numeric conversions throw. */
export function product(iterable: IterableResolvable<number>): number {
	let result = 1;
	for (const value of map(iterable, toNumberOrThrow)) {
		result *= value;
	}

	return result;
}
