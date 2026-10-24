import type { Constructor } from "../types";

/**
 * Check for a non-null object whose constructor exactly matches the supplied class, or Object when omitted.
 * @param input - Value to check.
 * @param constructorType - Exact constructor to require. Subclass instances do not match their parent constructor.
 * @returns Whether the constructor matches.
 */
export function isObject(
	input: unknown,
	constructorType?: ObjectConstructor,
): input is object;
/**
 * Check for a non-null object whose constructor exactly matches the supplied class, or Object when omitted.
 * @param input - Value to check.
 * @param constructorType - Exact constructor to require. Subclass instances do not match their parent constructor.
 * @returns Whether the constructor matches.
 */
export function isObject<T extends Constructor<unknown>>(
	input: unknown,
	constructorType: T,
): input is InstanceType<T>;
/**
 * Check for a non-null object whose constructor exactly matches the supplied class, or Object when omitted.
 * @param input - Value to check.
 * @param constructorType - Exact constructor to require. Subclass instances do not match their parent constructor.
 * @returns Whether the constructor matches.
 */
export function isObject<T extends Constructor<unknown> = ObjectConstructor>(
	input: unknown,
	constructorType?: T,
): input is object {
	return typeof input === "object" && input
		? input.constructor === (constructorType ?? Object)
		: false;
}
