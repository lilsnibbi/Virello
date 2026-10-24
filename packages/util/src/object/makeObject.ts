/** Turn a dotted path into a json object. */
export function makeObject(
	path: string,
	value: unknown,
	obj: Record<string, unknown> = Object.create(null),
): Record<string, unknown> {
	const route = path.split(".");
	if (
		route.some(
			(key) =>
				key === "__proto__" || key === "constructor" || key === "prototype",
		)
	) {
		throw new TypeError(
			"path cannot contain __proto__, constructor, or prototype",
		);
	}

	if (path.includes(".")) {
		const lastKey = route.pop() as string;
		let reference = obj;
		for (const key of route) {
			if (!Object.hasOwn(reference, key) || !reference[key])
				reference[key] = Object.create(null);
			reference = reference[key] as Record<string, unknown>;
		}
		reference[lastKey] = value;
	} else {
		obj[path] = value;
	}
	return obj;
}
