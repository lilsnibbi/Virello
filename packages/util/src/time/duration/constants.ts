import type {
	DurationFormatAssetsTime,
	DurationFormatSeparators,
} from "./DurationFormatter";

/** Fixed duration conversions in milliseconds. Months use one twelfth of a 365-day year. */
export enum Time {
	/** Milliseconds in one nanosecond. */
	Nanosecond = 1 / 1_000_000,
	/** Milliseconds in one microsecond. */
	Microsecond = 1 / 1000,
	/** Milliseconds in one millisecond. */
	Millisecond = 1,
	/** Milliseconds in one second. */
	Second = 1000,
	/** Milliseconds in one minute. */
	Minute = Second * 60,
	/** Milliseconds in one hour. */
	Hour = Minute * 60,
	/** Milliseconds in one day. */
	Day = Hour * 24,
	/** Milliseconds in one week. */
	Week = Day * 7,
	/** Milliseconds in one month. */
	Month = Day * (365 / 12),
	/** Milliseconds in one year. */
	Year = Day * 365,
}

/** The supported time types */
export enum TimeTypes {
	/** Name used for second labels. */
	Second = "second",
	/** Name used for minute labels. */
	Minute = "minute",
	/** Name used for hour labels. */
	Hour = "hour",
	/** Name used for day labels. */
	Day = "day",
	/** Name used for week labels. */
	Week = "week",
	/** Name used for month labels. */
	Month = "month",
	/** Name used for year labels. */
	Year = "year",
}

/** English singular and plural duration labels. */
export const DEFAULT_UNITS: DurationFormatAssetsTime = {
	/** Default English year labels. */
	[TimeTypes.Year]: {
		/** Singular label used for one. */
		1: "year",
		/** Plural label used for other amounts. */
		DEFAULT: "years",
	},
	/** Default English month labels. */
	[TimeTypes.Month]: {
		/** Singular label used for one. */
		1: "month",
		/** Plural label used for other amounts. */
		DEFAULT: "months",
	},
	/** Default English week labels. */
	[TimeTypes.Week]: {
		/** Singular label used for one. */
		1: "week",
		/** Plural label used for other amounts. */
		DEFAULT: "weeks",
	},
	/** Default English day labels. */
	[TimeTypes.Day]: {
		/** Singular label used for one. */
		1: "day",
		/** Plural label used for other amounts. */
		DEFAULT: "days",
	},
	/** Default English hour labels. */
	[TimeTypes.Hour]: {
		/** Singular label used for one. */
		1: "hour",
		/** Plural label used for other amounts. */
		DEFAULT: "hours",
	},
	/** Default English minute labels. */
	[TimeTypes.Minute]: {
		/** Singular label used for one. */
		1: "minute",
		/** Plural label used for other amounts. */
		DEFAULT: "minutes",
	},
	/** Default English second labels. */
	[TimeTypes.Second]: {
		/** Singular label used for one. */
		1: "second",
		/** Plural label used for other amounts. */
		DEFAULT: "seconds",
	},
};

/** Default duration separators: one space at each boundary. */
export const DEFAULT_SEPARATORS: DurationFormatSeparators = {
	/** One-space separator at this duration boundary. */
	left: " ",
	/** One-space separator at this duration boundary. */
	right: " ",
	/** One-space separator at this duration boundary. */
	final: " ",
};
