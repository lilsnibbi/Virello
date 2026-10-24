import { isObject } from "../guards/isObject";

/** Merges two objects */
export function mergeObjects<A extends object, B extends object>(
	objTarget: A,
	objSource: Readonly<B>,
): A & B {
	for (const [key, value] of Object.entries(objSource)) {
		if (!Object.hasOwn(objTarget, key)) {
			Object.defineProperty(objTarget, key, {
				configurable: true,
				enumerable: true,
				writable: true,
				value,
			});
			continue;
		}
		const targetValue = Reflect.get(objTarget, key);
		if (isObject(value)) {
			Reflect.set(
				objTarget,
				key,
				isObject(targetValue)
					? mergeObjects(targetValue, value as object)
					: value,
			);
		} else if (!isObject(targetValue)) {
			Reflect.set(objTarget, key, value);
		}
	}

	return objTarget as A & B;
}
