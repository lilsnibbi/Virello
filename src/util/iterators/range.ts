import { toNumberOrThrow } from "./shared/_toNumberOrThrow";

/**
 * Lazily yield numbers from start toward end, excluding end. Step defaults to 1 ascending or -1 descending. Zero or a step
 * pointing away from end throws; equal endpoints yield nothing.
 */
export function* range(
	start: number,
	end: number,
	step?: number | undefined,
): IterableIterator<number> {
	start = toNumberOrThrow(start);
	end = toNumberOrThrow(end);

	if (step === undefined) {
		step = start < end ? 1 : -1;
	} else {
		step = toNumberOrThrow(step);

		// Prevent infinite loops.
		if (step === 0) {
			throw new RangeError("Step cannot be zero");
		}

		// If the step is positive, the start must be less than the end.
		if (step > 0 && start > end) {
			throw new RangeError("Start must be less than end when step is positive");
		} else if (step < 0 && start < end) {
			throw new RangeError(
				"Start must be greater than end when step is negative",
			);
		}
	}

	if (start < end) {
		for (let i = start; i < end; i += step) {
			yield i;
		}
	} else {
		for (let i = start; i > end; i += step) {
			yield i;
		}
	}
}
