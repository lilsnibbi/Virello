import { record } from "../common";

/** Merge JSON objects in place. Nested objects merge; arrays and explicit null replace. */
export function merge(target: object, patch: object): void {
	for (const [key, value] of Object.entries(patch)) {
		if (
			value === undefined ||
			key === "__proto__" ||
			key === "constructor" ||
			key === "prototype"
		)
			continue;
		const current: unknown = Reflect.get(target, key);
		if (record(value)) {
			const nested = record(current) ? current : {};
			merge(nested, value);
			Reflect.set(target, key, nested);
		} else {
			Reflect.set(
				target,
				key,
				Array.isArray(value) ? structuredClone(value) : value,
			);
		}
	}
}
