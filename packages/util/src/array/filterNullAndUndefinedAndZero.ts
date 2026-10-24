import { isNullOrUndefinedOrZero } from "../guards/isNullOrUndefinedOrZero";
import type { Nullish } from "../types";

/** Check whether a value is not `null` nor `undefined` nor `0`. This can be used in {@link Array.filter} to remove `null`, `undefined` from the array type */
export function filterNullAndUndefinedAndZero<TValue>(
	value: TValue | Nullish | 0,
): value is TValue {
	return !isNullOrUndefinedOrZero(value);
}

export {
	filterNullAndUndefinedAndZero as filterNullishAndZero,
	/** @deprecated Will be removed in the next major version, switch to either `filterNullishAndZero` or {@link filterNullAndUndefinedAndZero}. */
	filterNullAndUndefinedAndZero as filterNullishOrZero,
};
