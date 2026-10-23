import { isNullish } from "./isNullOrUndefined";

/** Check whether any of the {@link keys} are in the {@link obj} */
export function hasAtLeastOneKeyInObject<
	T extends object,
	K extends PropertyKey,
>(obj: T, keys: readonly K[]): obj is T & { [key in K]-?: unknown } {
	return !isNullish(obj) && keys.some((key) => Object.hasOwn(obj, key));
}
