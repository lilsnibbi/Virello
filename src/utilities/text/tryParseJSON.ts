/** Try parse a stringified JSON string. */
export function tryParseJSON(
	value: string,
	reviver?: (this: object, key: string, value: unknown) => unknown,
): object | string | number | boolean | null {
	try {
		return JSON.parse(value, reviver);
	} catch (_err) {
		return value;
	}
}

export {
	/** @deprecated Will be removed in the next major version, switch to {@link tryParseJSON}. */
	tryParseJSON as tryParse,
};
