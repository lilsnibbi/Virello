/** Treat a value as T without checking it. This only changes the TypeScript type. */
export function cast<T>(value: unknown): T {
	return value as T;
}
