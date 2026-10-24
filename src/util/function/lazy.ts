/** Lazily creates a constant or load a module and caches it internally */
export function lazy<T>(cb: () => T) {
	let defaultValue: T;

	return () => (defaultValue ??= cb());
}
