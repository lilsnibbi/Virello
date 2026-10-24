/** Cancellation and event-loop settings for sleep. */
export interface SleepOptions {
	/** When provided the corresponding `AbortController` can be used to cancel an asynchronous action. */
	signal?: AbortSignal | undefined;

	/** Set to `false` to indicate that the scheduled `Timeout` should not require the event loop to remain active.
	 * @default true */
	ref?: boolean | undefined;
}

/**
 * Wait for a timer and return a supplied value.
 * @param ms - Delay in milliseconds.
 * @param value - Value to resolve with; defaults to undefined.
 * @param options - Optional abort signal and timer ref setting.
 * @returns A promise that rejects with signal.reason when aborted.
 */
export function sleep<T = undefined>(
	ms: number,
	value?: T,
	options?: SleepOptions,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const signal = options?.signal;
		if (signal) {
			if (signal.aborted) {
				reject(signal.reason);
				return;
			}

			signal.addEventListener("abort", () => {
				clearTimeout(timer);
				reject(signal.reason);
			});
		}

		const timer: NodeJS.Timeout | number = setTimeout(
			() => resolve(value!),
			ms,
		);
		if (options?.ref === false && typeof timer === "object") {
			timer.unref();
		}
	});
}
