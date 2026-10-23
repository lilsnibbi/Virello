/** Transforms text from `snAkE_cASE` to `camelCase`. */
export function snakeToCamelCase(str: string) {
	return str
		.toLowerCase()
		.replace(/([-_][a-z])/g, (group: string) => group.slice(1).toUpperCase());
}

export { snakeToCamelCase as kebabToCamelCase };
