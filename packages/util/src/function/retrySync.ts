/**
 * Call cb until it succeeds or the supplied attempt count is exhausted.
 * @param cb - Operation to attempt.
 * @param retries - Total attempt count; 0 still calls once. Negative values throw RangeError.
 * @returns The first successful result.
 * @throws The last failure after all attempts fail.
 */
export function retrySync<T>(cb: () => T, retries: number): T {
	if (retries < 0) throw new RangeError("Expected retries to be a number >= 0");
	if (retries === 0) return cb();

	let lastError: unknown;
	for (let i = 0; i < retries; ++i) {
		try {
			return cb();
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError;
}
