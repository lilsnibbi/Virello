/** Compare if both arrays are strictly equal */
export function arrayStrictEquals<T extends readonly unknown[]>(
	arr1: T,
	arr2: T,
): boolean {
	if (arr1 === arr2) return true;
	if (arr1.length !== arr2.length) return false;

	for (let i = 0; i < arr1.length; i++) {
		if (arr1[i] !== arr2[i] || typeof arr1[i] !== typeof arr2[i]) return false;
	}
	return true;
}
