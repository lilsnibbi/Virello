import { isNullOrUndefinedOrEmpty } from "../guards/isNullOrUndefinedOrEmpty";
import type { Nullish } from "../types";

/** Check whether a value is not `null` nor `undefined` nor `''` (empty string). This can be used in {@link Array.filter} to remove `null`, `undefined` from the array type */
export function filterNullAndUndefinedAndEmpty<TValue>(
	value: TValue | Nullish | "",
): value is TValue {
	return !isNullOrUndefinedOrEmpty(value);
}

export {
	filterNullAndUndefinedAndEmpty as filterNullishAndEmpty,
	/** @deprecated Will be removed in the next major version, switch to either `filterNullishAndEmpty` or {@link filterNullAndUndefinedAndEmpty}. */
	filterNullAndUndefinedAndEmpty as filterNullishOrEmpty,
};
