import type { Nullish } from "../types";

/** Check whether a value is `null` or `undefined` */
export function isNullOrUndefined(value: unknown): value is Nullish {
	return value === undefined || value === null;
}

export { isNullOrUndefined as isNullish };
