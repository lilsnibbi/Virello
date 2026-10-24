/** Sleeps for the specified number of milliseconds synchronously. */
export function sleepSync<T = undefined>(ms: number, value?: T): T {
	const end = Date.now() + ms;
	while (Date.now() < end);
	return value!;
}
