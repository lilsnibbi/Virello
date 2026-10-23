/** Throttled function returning its last invocation result. It also provides a timer reset helper. */
export type ThrottleFn<T extends (...args: never[]) => unknown> = T & {
	/** Reset the last-invocation timestamp so a later call can run immediately; does not invoke the callback. */
	flush: () => void;
};

/**
 * Run func only when more than wait milliseconds have elapsed since its last invocation; suppressed calls return the
 * previous result.
 * @param func - Callback to limit.
 * @param wait - Minimum interval in milliseconds.
 * @returns A function with flush() to reset the interval; no trailing call is scheduled.
 */
export function throttle<T extends (...args: never[]) => unknown>(
	func: T,
	wait: number,
): ThrottleFn<T> {
	let prev = 0;
	let prevValue: ReturnType<T>;

	return Object.assign(
		(...args: Parameters<T>) => {
			const now = Date.now();
			if (now - prev > wait) {
				prev = now;
				return (prevValue = func(...args) as ReturnType<T>);
			}

			return prevValue;
		},
		{
			flush() {
				prev = 0;
			},
		},
	) as ThrottleFn<T>;
}
