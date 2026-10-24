import { isNullish } from "../guards/isNullOrUndefined";
import type { Nullish } from "../types";

/** Check whether a value is not `null` nor `undefined`. This can be used in {@link Array.filter} to remove `null` and `undefined` from the array type */
export function filterNullAndUndefined<TValue>(
	value: TValue | Nullish,
): value is TValue {
	return !isNullish(value);
}

export { filterNullAndUndefined as filterNullish };
