import { DEFAULT_SEPARATORS, DEFAULT_UNITS, TimeTypes } from "./constants";

/** The duration of each time type in milliseconds */
const kTimeDurations: readonly [TimeTypes, number][] = [
	[TimeTypes.Year, 31536000000],
	// 29.53059 days is the official duration of a month: https://en.wikipedia.org/wiki/Month
	[TimeTypes.Month, 2628000000],
	[TimeTypes.Week, 1000 * 60 * 60 * 24 * 7],
	[TimeTypes.Day, 1000 * 60 * 60 * 24],
	[TimeTypes.Hour, 1000 * 60 * 60],
	[TimeTypes.Minute, 1000 * 60],
	[TimeTypes.Second, 1000],
];

/** Display the duration */
export class DurationFormatter {
	/**
	 * Choose labels for each duration unit.
	 * @param units - Custom singular/plural labels; defaults to the English DEFAULT_UNITS object.
	 */
	public constructor(
		/** Unit labels retained by this formatter. Defaults to DEFAULT_UNITS. */
		public units: DurationFormatAssetsTime = DEFAULT_UNITS,
	) {}

	/**
	 * Format a millisecond duration using fixed year/month lengths and whole units down to seconds.
	 * @param duration - Duration in milliseconds; negative values get a leading minus sign.
	 * @param precision - Maximum nonzero unit parts; defaults to 7.
	 * @returns Text using the supplied separators; durations below one second display zero seconds.
	 */
	public format(
		duration: number,
		precision = 7,
		{
			left: leftSeparator = DEFAULT_SEPARATORS.left,
			right: rightSeparator = DEFAULT_SEPARATORS.right,
			final: finalSeparator = DEFAULT_SEPARATORS.final,
		}: DurationFormatSeparators = DEFAULT_SEPARATORS,
	) {
		const output: string[] = [];
		const negative = duration < 0;
		if (negative) duration *= -1;

		for (const [type, timeDuration] of kTimeDurations) {
			const division = duration / timeDuration;
			if (division < 1) continue;

			const floored = Math.floor(division);
			duration -= floored * timeDuration;
			output.push(addUnit(floored, this.units[type], leftSeparator!));

			// If the output has enough precision, break
			if (output.length >= precision) break;
		}

		if (output.length === 0)
			return addUnit(0, this.units[TimeTypes.Second], leftSeparator!);
		if (negative) output[0] = `-${output[0]}`;

		if (output.length > 1) {
			const last = output.pop();
			return `${output.join(rightSeparator!)}${finalSeparator}${last}`;
		}

		return output.join(rightSeparator!);
	}
}

/** Adds an unit, if non zero */
function addUnit(
	time: number,
	unit: DurationFormatAssetsUnit,
	separator: string,
) {
	if (Reflect.has(unit, time))
		return `${time}${separator}${Reflect.get(unit, time)}`;
	return `${time}${separator}${unit.DEFAULT}`;
}

/** Text separators used between amounts, labels, and duration parts. */
export interface DurationFormatSeparators {
	/** Between each amount and its unit label. Defaults to one space. */
	left?: string;
	/** Between unit parts except the final pair. Defaults to one space. */
	right?: string;
	/** Between the final two unit parts. Defaults to one space. */
	final?: string;
}

/** Unit labels keyed by an exact amount, with a DEFAULT fallback label. */
export interface DurationFormatAssetsUnit extends Record<number, string> {
	/** Label used when the exact amount has no custom entry. */
	DEFAULT: string;
}

/** Unit labels from seconds through years. */
export interface DurationFormatAssetsTime {
	/** Labels for second amounts. */
	[TimeTypes.Second]: DurationFormatAssetsUnit;
	/** Labels for minute amounts. */
	[TimeTypes.Minute]: DurationFormatAssetsUnit;
	/** Labels for hour amounts. */
	[TimeTypes.Hour]: DurationFormatAssetsUnit;
	/** Labels for day amounts. */
	[TimeTypes.Day]: DurationFormatAssetsUnit;
	/** Labels for week amounts. */
	[TimeTypes.Week]: DurationFormatAssetsUnit;
	/** Labels for month amounts. */
	[TimeTypes.Month]: DurationFormatAssetsUnit;
	/** Labels for year amounts. */
	[TimeTypes.Year]: DurationFormatAssetsUnit;
}
