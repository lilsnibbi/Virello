import type { AbstractCtor } from "../types";

/** Verify if the input is a class constructor. */
export function isClass(input: unknown): input is AbstractCtor {
	return typeof input === "function" && typeof input.prototype === "object";
}
