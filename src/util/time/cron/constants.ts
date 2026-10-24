export enum Time {
	Nanosecond = 1 / 1_000_000,
	Microsecond = 1 / 1000,
	Millisecond = 1,
	Second = 1000,
	Minute = Second * 60,
	Hour = Minute * 60,
	Day = Hour * 24,
	Week = Day * 7,
	Month = Day * (365 / 12),
	Year = Day * 365,
}

/** Matches one supported cron number, range, wildcard, or step component. */
export const partRegex = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/;

/** Matches the standalone helper’s random h and current-time ? tokens. */
export const wildcardRegex = /\bh\b|\B\?\B/g;

/** Inclusive numeric bounds for minute, hour, day, month, and weekday fields, in that order. */
export const allowedNum = [
	[0, 59],
	[0, 23],
	[1, 31],
	[1, 12],
	[0, 6],
];

/** Five-field expressions for annual, monthly, weekly, daily, and hourly aliases. */
export const predefined = {
	/** Five-field cron expression for the @annually alias. */
	"@annually": "0 0 1 1 *",
	/** Five-field cron expression for the @yearly alias. */
	"@yearly": "0 0 1 1 *",
	/** Five-field cron expression for the @monthly alias. */
	"@monthly": "0 0 1 * *",
	/** Five-field cron expression for the @weekly alias. */
	"@weekly": "0 0 * * 0",
	/** Five-field cron expression for the @daily alias. */
	"@daily": "0 0 * * *",
	/** Five-field cron expression for the @hourly alias. */
	"@hourly": "0 * * * *",
} as const;

/** Numeric month and weekday values for three-letter cron names. */
export const cronTokens = {
	/** Numeric cron value for jan. */
	jan: 1,
	/** Numeric cron value for feb. */
	feb: 2,
	/** Numeric cron value for mar. */
	mar: 3,
	/** Numeric cron value for apr. */
	apr: 4,
	/** Numeric cron value for may. */
	may: 5,
	/** Numeric cron value for jun. */
	jun: 6,
	/** Numeric cron value for jul. */
	jul: 7,
	/** Numeric cron value for aug. */
	aug: 8,
	/** Numeric cron value for sep. */
	sep: 9,
	/** Numeric cron value for oct. */
	oct: 10,
	/** Numeric cron value for nov. */
	nov: 11,
	/** Numeric cron value for dec. */
	dec: 12,
	/** Numeric cron value for sun. */
	sun: 0,
	/** Numeric cron value for mon. */
	mon: 1,
	/** Numeric cron value for tue. */
	tue: 2,
	/** Numeric cron value for wed. */
	wed: 3,
	/** Numeric cron value for thu. */
	thu: 4,
	/** Numeric cron value for fri. */
	fri: 5,
	/** Numeric cron value for sat. */
	sat: 6,
} as const;

/** Global regex matching supported three-letter month and weekday names. */
export const tokensRegex = new RegExp(Object.keys(cronTokens).join("|"), "g");
