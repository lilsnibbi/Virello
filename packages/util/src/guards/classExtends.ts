import type { AbstractCtor } from "../types";

/** Check whether the value class extends the base class. */
export function classExtends<T extends AbstractCtor>(
	value: AbstractCtor,
	base: T,
): value is T {
	let ctor: AbstractCtor | null = value;
	while (ctor !== null) {
		if (ctor === base) return true;
		ctor = Object.getPrototypeOf(ctor);
	}

	return false;
}
