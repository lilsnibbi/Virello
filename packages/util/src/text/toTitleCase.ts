const TO_TITLE_CASE = /[A-Za-zÀ-ÖØ-öø-ÿ]\S*/g;

/** The variants that will not strictly follow the `toTitleCase` algorithm and will instead return the value matched with the key. */
export const toTitleCaseDiscordJsVariants: Record<string, string> = {
	/** Readable replacement used by toTitleCase for the Discord type name. */
	textchannel: "TextChannel",
	/** Readable replacement used by toTitleCase for the Discord type name. */
	voicechannel: "VoiceChannel",
	/** Readable replacement used by toTitleCase for the Discord type name. */
	categorychannel: "CategoryChannel",
	/** Readable replacement used by toTitleCase for the Discord type name. */
	guildmember: "GuildMember",
};

/** Convert text to title case, keeping configured spellings such as TextChannel. */
export function toTitleCase(
	str: string,
	options: ToTitleCaseOptions = {},
): string {
	const { additionalVariants = {}, caseSensitive } = options;
	const titleCaseVariants = {
		...toTitleCaseDiscordJsVariants,
		...(caseSensitive
			? additionalVariants
			: Object.fromEntries(
					Object.entries(additionalVariants).map(([key, variant]) => [
						key.toLowerCase(),
						variant,
					]),
				)),
	};

	return str.replace(
		TO_TITLE_CASE,
		(txt) =>
			titleCaseVariants[caseSensitive ? txt : txt.toLowerCase()] ??
			txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase(),
	);
}

/** The options to use when converting a string to title case */
export interface ToTitleCaseOptions {
	/** The optional additional variants to use when converting the string */
	additionalVariants?: Record<string, string>;

	/** Whether to convert the string to title case in a case sensitive manner. */
	caseSensitive?: boolean;
}
