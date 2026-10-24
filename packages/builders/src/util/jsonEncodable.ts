/** Builders are accepted wherever a native embed or component is accepted. */
export interface JSONEncodable<T> {
	toJSON(): T;
}
export function isJSONEncodable<T>(
	value: T | JSONEncodable<T> | undefined,
): value is JSONEncodable<T> {
	return (
		typeof value === "object" &&
		value !== null &&
		"toJSON" in value &&
		typeof value.toJSON === "function"
	);
}
