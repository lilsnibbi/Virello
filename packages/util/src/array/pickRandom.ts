/**
 * Pick one random value, or multiple values without replacement from a copy of the array.
 * @param array - Source values; the original array is unchanged.
 * @param amount - Defaults to 1. Exactly 1 returns one value; other amounts return an array capped at the source length.
 * @returns A value (undefined for an empty array with amount 1), or the selected array.
 */
export function pickRandom<T>(array: readonly T[], amount?: 1): T;
/**
 * Pick one random value, or multiple values without replacement from a copy of the array.
 * @param array - Source values; the original array is unchanged.
 * @param amount - Defaults to 1. Exactly 1 returns one value; other amounts return an array capped at the source length.
 * @returns A value (undefined for an empty array with amount 1), or the selected array.
 */
export function pickRandom<T>(array: readonly T[], amount: number): T[];
/**
 * Pick one random value, or multiple values without replacement from a copy of the array.
 * @param array - Source values; the original array is unchanged.
 * @param amount - Defaults to 1. Exactly 1 returns one value; other amounts return an array capped at the source length.
 * @returns A value (undefined for an empty array with amount 1), or the selected array.
 */
export function pickRandom<T>(array: readonly T[], amount = 1): T | T[] {
	const arr = [...array];

	if (typeof amount === "undefined" || amount === 1) {
		return arr[Math.floor(Math.random() * arr.length)];
	}

	if (!arr.length || !amount) {
		return [];
	}

	return Array.from(
		{ length: Math.min(amount, arr.length) },
		() => arr.splice(Math.floor(Math.random() * arr.length), 1)[0],
	);
}
