/** Convert a TypeScript enum to a 1-way object, stripping out the number keys. */
export function enumToObject<T extends object>(
	enumObject: T,
): { [K in Exclude<keyof T, `${number}`>]: T[K] } {
	const result = {} as { [K in Exclude<keyof T, `${number}`>]: T[K] };
	for (const [key, value] of Object.entries(enumObject)) {
		if (Number.isNaN(Number(key)))
			result[key as Exclude<keyof T, `${number}`>] = value;
	}

	return result;
}
