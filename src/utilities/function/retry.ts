import type { Awaitable } from "../types";

/**
 * Call cb until it succeeds or the supplied attempt count is exhausted. Each result is awaited.
 * @param cb - Operation to attempt.
 * @param retries - Total attempt count; 0 still calls once. Negative values throw RangeError.
 * @returns The first successful result.
 * @throws The last failure after all attempts fail.
 */
export async function retry<T>(
	cb: () => Awaitable<T>,
	retries: number,
): Promise<T> {
	if (retries < 0) throw new RangeError("Expected retries to be a number >= 0");
	if (retries === 0) return cb();

	let lastError: unknown;
	for (let i = 0; i < retries; ++i) {
		try {
			return await cb();
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError;
}
