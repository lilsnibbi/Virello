/** Check whether any of the {@link keys} are in the {@link map} */
export function hasAtLeastOneKeyInMap<T>(
	map: ReadonlyMap<T, unknown>,
	keys: readonly T[],
): boolean {
	return keys.some((key) => map.has(key));
}
