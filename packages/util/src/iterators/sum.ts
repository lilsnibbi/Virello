import type { IterableResolvable } from "./from";
import { map } from "./map";
import {
	type NumberResolvable,
	toNumberOrThrow,
} from "./shared/_toNumberOrThrow";

/** Consume numeric-coercible values and return their sum, starting at 0. Invalid numeric conversions throw. */
export function sum(iterable: IterableResolvable<NumberResolvable>) {
	let sum = 0;
	for (const value of map(iterable, toNumberOrThrow)) {
		sum += value;
	}

	return sum;
}
