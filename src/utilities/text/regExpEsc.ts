const REGEXPESC = /[-/\\^$*+?.()|[\]{}]/g;

/** Cleans a string from regex injection */
export function regExpEsc(str: string): string {
	return str.replace(REGEXPESC, "\\$&");
}
