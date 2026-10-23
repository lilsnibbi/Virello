/** Tries parse a string to a {@link URL} object */
export function tryParseURL(value: string): URL | null {
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

export {
	/** @deprecated Will be removed in the next major version, switch to {@link tryParseURL}. */
	tryParseURL as parseURL,
};
