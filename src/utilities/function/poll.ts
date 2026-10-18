import { fallbackLogger } from "../../core/logging/console";
import { writeEvent } from "../../core/logging/diagnostics";
import type { Awaitable } from "../types";
import { sleep } from "./sleep";

/** The options for the {@link poll} function */
export interface PollOptions {
	/** An optional AbortSignal to abort the polling. */
	signal?: AbortSignal | undefined;

	/** Maximum additional attempts after the first call. Defaults to Infinity; 0 runs cb once without testing its condition. */
	maximumRetries?: number | null | undefined;

	/** The number of time to wait between each poll.
	 * @default 0 */
	waitBetweenRetries?: number | null | undefined;

	/** Whether to log to the console on each polling interval, allowing the tracing of the amount of required attempts.
	 * @default false */
	verbose?: boolean | undefined;
}

/**
 * Call cb once, then retry while cbCondition is false and the retry budget allows it. Callback results and conditions are
 * awaited.
 * @param cb - Operation receiving the optional abort signal.
 * @param cbCondition - Test for an acceptable result.
 * @param options - Cancellation, retry limit, delay, and logging settings.
 * @returns The last result, even if the condition is still false when retries run out.
 * @throws For invalid options, callback failures, or cancellation.
 */
export async function poll<T>(
	cb: (signal: AbortSignal | undefined) => Awaitable<T>,
	cbCondition: (
		value: Awaited<T>,
		signal: AbortSignal | undefined,
	) => Awaitable<boolean>,
	options: PollOptions = {},
): Promise<Awaitable<T>> {
	const signal = options.signal ?? undefined;

	const maximumRetries = options.maximumRetries ?? Infinity;
	if (typeof maximumRetries !== "number")
		throw new TypeError("Expected maximumRetries to be a number");
	if (!(maximumRetries >= 0))
		throw new RangeError("Expected maximumRetries to be a non-negative number");

	const waitBetweenRetries = options.waitBetweenRetries ?? 0;
	if (typeof waitBetweenRetries !== "number")
		throw new TypeError("Expected waitBetweenRetries to be a number");
	if (!Number.isSafeInteger(waitBetweenRetries) || waitBetweenRetries < 0) {
		throw new RangeError(
			"Expected waitBetweenRetries to be a positive safe integer",
		);
	}

	signal?.throwIfAborted();
	let result = await cb(signal);
	for (
		let retries = 0;
		retries < maximumRetries && !(await cbCondition(result, signal));
		retries++
	) {
		signal?.throwIfAborted();

		if (waitBetweenRetries > 0) {
			if (options.verbose)
				writeEvent(fallbackLogger(), "notif", {
					component: "utilities.poll",
					event: "waiting",
					message:
						"Poll condition is not satisfied; waiting for the next attempt.",
					context: { delayMs: waitBetweenRetries, attempt: retries + 1 },
				});
			await sleep(waitBetweenRetries, undefined, { signal });
		}

		result = await cb(signal);
	}

	return result;
}
