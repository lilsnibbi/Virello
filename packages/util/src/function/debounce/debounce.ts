/**
 * lodash (Custom Build) https://lodash.com/
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors https://jquery.org/
 * Released under MIT license https://lodash.com/license
 * Based on Underscore.js 1.8.3 http://underscorejs.org/LICENSE
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Delay settings for trailing-edge debouncing. */
export interface DebounceSettings {
	/** The number of milliseconds to delay.
	 * @default 0 */
	wait?: number;

	/** The maximum time `func` is allowed to be delayed before it's invoked
	 * @default null */
	maxWait?: number | null;
}

/** Debounced callback returning the most recent result, with cancellation and immediate-flush helpers. */
export interface DebouncedFunc<
	FnArgumentsType extends unknown[],
	FnReturnType,
> {
	/** Call the original function, but applying the debounce rules. */
	(...args: FnArgumentsType): FnReturnType | undefined;

	/** Throw away any pending invocation of the debounced function. */
	cancel(): void;

	/** If there is a pending invocation of the debounced function, invoke it immediately and return its return value.  Otherwise, return the value from the last invocation, or undefined if the debounced function was never invoked. */
	flush(): FnReturnType | undefined;
}

/**
 * Delay calls until input has been quiet for wait milliseconds, retaining the latest arguments.
 * @param func - Callback to invoke on the trailing edge.
 * @param options - wait defaults to 0; maxWait is omitted by default and is never smaller than wait.
 * @returns A debounced callback with cancel() and flush(). It returns the latest completed invocation result, or
 * undefined.
 */
export function debounce<FnArgumentsType extends unknown[], FnReturnType>(
	func: (...args: FnArgumentsType) => FnReturnType,
	options: DebounceSettings = {},
): DebouncedFunc<FnArgumentsType, FnReturnType> {
	let lastArgs: FnArgumentsType | undefined;
	let result: FnReturnType | undefined;
	let timerId: NodeJS.Timeout | undefined;
	let lastCallTime: number | undefined;
	let lastInvokeTime = 0;

	const wait = options.wait ?? 0;
	const maxWait =
		typeof options.maxWait === "number"
			? Math.max(options.maxWait, wait)
			: null;

	function invokeFunc(time: number) {
		const args = lastArgs;

		lastArgs = undefined;
		lastInvokeTime = time;
		result = func(...args!);
		return result;
	}

	function leadingEdge(time: number) {
		// Reset any `maxWait` timer.
		lastInvokeTime = time;
		// Start the timer for the trailing edge.
		timerId = setTimeout(timerExpired, wait);
		// Invoke the leading edge.
		return result;
	}

	function remainingWait(time: number) {
		const timeSinceLastCall = time - lastCallTime!;
		const timeSinceLastInvoke = time - lastInvokeTime;
		const result = wait - timeSinceLastCall;

		return maxWait === null
			? result
			: Math.min(result, maxWait - timeSinceLastInvoke);
	}

	function shouldInvoke(time: number) {
		const timeSinceLastCall = time - lastCallTime!;
		const timeSinceLastInvoke = time - lastInvokeTime;

		// Either this is the first call, activity has stopped and we're at the
		// trailing edge, the system time has gone backwards and we're treating
		// it as the trailing edge, or we've hit the `maxWait` limit.
		return (
			lastCallTime === undefined || //
			timeSinceLastCall >= wait ||
			timeSinceLastCall < 0 ||
			(maxWait !== null && timeSinceLastInvoke >= maxWait)
		);
	}

	function timerExpired() {
		const time = Date.now();
		if (shouldInvoke(time)) {
			trailingEdge(time);
			return;
		}
		// Restart the timer.
		timerId = setTimeout(timerExpired, remainingWait(time));
	}

	function trailingEdge(time: number) {
		timerId = undefined;
		return lastArgs === undefined ? result : invokeFunc(time);
	}

	function cancel() {
		if (timerId !== undefined) {
			clearTimeout(timerId);
		}

		lastInvokeTime = 0;
		lastArgs = undefined;
		lastCallTime = undefined;
		timerId = undefined;
	}

	function flush() {
		if (timerId === undefined) return result;
		clearTimeout(timerId);
		return trailingEdge(Date.now());
	}

	function debounced(...args: FnArgumentsType) {
		const time = Date.now();
		const isInvoking = shouldInvoke(time);

		lastArgs = args;
		lastCallTime = time;

		if (isInvoking) {
			if (timerId === undefined) {
				return leadingEdge(lastCallTime);
			}
			if (maxWait !== null) {
				// Handle invocations in a tight loop.
				clearTimeout(timerId);
				timerId = setTimeout(timerExpired, wait);
				return invokeFunc(lastCallTime);
			}
		}

		if (timerId === undefined) {
			timerId = setTimeout(timerExpired, wait);
		}

		return result;
	}

	debounced.cancel = cancel;
	debounced.flush = flush;

	return debounced;
}
