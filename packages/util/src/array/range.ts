/** Get an array of numbers with the selected range */
export function range(min: number, max: number, step: number): number[] {
	return new Array(Math.floor((max - min) / step) + 1)
		.fill(0)
		.map((_val, i) => min + i * step);
}
