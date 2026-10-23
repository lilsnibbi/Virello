import type { Nullish } from "../types";
import { isNullish } from "./isNullOrUndefined";

/** Check whether a value is `null`, `undefined` or `''`, `[]` */
export function isNullOrUndefinedOrEmpty(
	value: unknown,
): value is Nullish | "" {
	return isNullish(value) || (value as string | unknown[]).length === 0;
}

export { isNullOrUndefinedOrEmpty as isNullishOrEmpty };
