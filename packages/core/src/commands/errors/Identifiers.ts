/** Stable identifiers for argument and command-check errors. */
export enum Identifiers {
	/** No positional arguments remain. */
	ArgsMissing = "argsMissing",
	/** The requested argument resolver is not registered. */
	ArgsUnavailable = "argsUnavailable",

	/** No accepted boolean spelling matched. */
	ArgumentBooleanError = "booleanError",
	/** No cached channel matched. */
	ArgumentChannelError = "channelError",
	/** The text could not be parsed as a date. */
	ArgumentDateError = "dateError",
	/** The date is before the minimum timestamp. */
	ArgumentDateTooEarly = "dateTooEarly",
	/** The date is after the maximum timestamp. */
	ArgumentDateTooFar = "dateTooFar",
	/** The resolved channel is not an accepted DM channel. */
	ArgumentDMChannelError = "dmChannelError",
	/** No Unicode or custom Discord emoji could be parsed. */
	ArgumentEmojiError = "emojiError",
	/** Number() produced NaN. */
	ArgumentFloatError = "floatError",
	/** The parsed number exceeds the maximum. */
	ArgumentFloatTooLarge = "floatTooLarge",
	/** The parsed number is below the minimum. */
	ArgumentFloatTooSmall = "floatTooSmall",
	/** The guild ID is invalid or its fetch failed. */
	ArgumentGuildError = "guildError",
	/** The resolved guild channel is not a category. */
	ArgumentGuildCategoryChannelError = "categoryChannelError",
	/** No guild channel matched. */
	ArgumentGuildChannelError = "guildChannelError",
	/** The guild-channel resolver was used outside a guild. */
	ArgumentGuildChannelMissingGuildError = "guildChannelMissingGuildError",
	/** The channel is not an announcement channel. */
	ArgumentGuildNewsChannelError = "guildNewsChannelError",
	/** The channel is not an announcement thread. */
	ArgumentGuildNewsThreadChannelError = "guildNewsThreadChannelError",
	/** The channel is not a private thread. */
	ArgumentGuildPrivateThreadChannelError = "guildPrivateThreadChannelError",
	/** The channel is not a public thread. */
	ArgumentGuildPublicThreadChannelError = "guildPublicThreadChannelError",
	/** The channel is not a stage channel. */
	ArgumentGuildStageVoiceChannelError = "guildStageVoiceChannelError",
	/** The channel is not a guild text channel. */
	ArgumentGuildTextChannelError = "guildTextChannelError",
	/** The channel is not a thread. */
	ArgumentGuildThreadChannelError = "guildThreadChannelError",
	/** The channel is not a guild voice channel. */
	ArgumentGuildVoiceChannelError = "guildVoiceChannelError",
	/** The URL constructor rejected the text. */
	ArgumentHyperlinkError = "hyperlinkError",
	/** The parsed value is not an integer. */
	ArgumentIntegerError = "integerError",
	/** The integer exceeds the maximum. */
	ArgumentIntegerTooLarge = "integerTooLarge",
	/** The integer is below the minimum. */
	ArgumentIntegerTooSmall = "integerTooSmall",
	/** No guild member could be resolved. */
	ArgumentMemberError = "memberError",
	/** The member resolver was used outside a guild. */
	ArgumentMemberMissingGuild = "memberMissingGuild",
	/** No message could be resolved. */
	ArgumentMessageError = "messageError",
	/** Number() produced NaN. */
	ArgumentNumberError = "numberError",
	/** The number exceeds the maximum. */
	ArgumentNumberTooLarge = "numberTooLarge",
	/** The number is below the minimum. */
	ArgumentNumberTooSmall = "numberTooSmall",
	/** No role could be resolved. */
	ArgumentRoleError = "roleError",
	/** The role resolver was used outside a guild. */
	ArgumentRoleMissingGuild = "roleMissingGuild",
	/** The text exceeds the maximum length. */
	ArgumentStringTooLong = "stringTooLong",
	/** The text is shorter than the minimum length. */
	ArgumentStringTooShort = "stringTooShort",
	/** No user could be resolved. */
	ArgumentUserError = "userError",
	/** No enum values were configured. */
	ArgumentEnumEmptyError = "enumEmptyError",
	/** The input matched no configured enum value. */
	ArgumentEnumError = "enumError",

	/** The command is disabled. */
	CommandDisabled = "commandDisabled",

	/** The cooldown bucket has no uses remaining. */
	PreconditionCooldown = "preconditionCooldown",
	/** @deprecated Use {@link PreconditionRunIn} instead. */
	PreconditionDMOnly = "preconditionDmOnly",
	/** @deprecated Use {@link PreconditionRunIn} instead. */
	PreconditionGuildNewsOnly = "preconditionGuildNewsOnly",
	/** @deprecated Use {@link PreconditionRunIn} instead. */
	PreconditionGuildNewsThreadOnly = "preconditionGuildNewsThreadOnly",
	/** @deprecated Use {@link PreconditionRunIn} instead. */
	PreconditionGuildOnly = "preconditionGuildOnly",
	/** @deprecated Use {@link PreconditionRunIn} instead. */
	PreconditionGuildPrivateThreadOnly = "preconditionGuildPrivateThreadOnly",
	/** @deprecated Use {@link PreconditionRunIn} instead. */
	PreconditionGuildPublicThreadOnly = "preconditionGuildPublicThreadOnly",
	/** @deprecated Use {@link PreconditionRunIn} instead. */
	PreconditionGuildTextOnly = "preconditionGuildTextOnly",
	/** @deprecated Use {@link PreconditionRunIn} instead. */
	PreconditionGuildVoiceOnly = "preconditionGuildVoiceOnly",
	/** The channel is not explicitly marked NSFW. */
	PreconditionNSFW = "preconditionNsfw",
	/** The bot lacks required permissions. */
	PreconditionClientPermissions = "preconditionClientPermissions",
	/** The bot user ID is unavailable for permission checks. */
	PreconditionClientPermissionsNoClient = "preconditionClientPermissionsNoClient",
	/** The bot’s channel permissions could not be resolved. */
	PreconditionClientPermissionsNoPermissions = "preconditionClientPermissionsNoPermissions",
	/** The channel type is not allowed. */
	PreconditionRunIn = "preconditionRunIn",
	/** The invoking user lacks required permissions. */
	PreconditionUserPermissions = "preconditionUserPermissions",
	/** The invoking user’s permissions could not be resolved. */
	PreconditionUserPermissionsNoPermissions = "preconditionUserPermissionsNoPermissions",
	/** @deprecated Use {@link PreconditionRunIn} instead. */
	PreconditionThreadOnly = "preconditionThreadOnly",

	/** The named check is not registered. */
	PreconditionUnavailable = "preconditionUnavailable",

	/** The check has no messageRun handler. */
	PreconditionMissingMessageHandler = "preconditionMissingMessageHandler",
	/** The check has no chatInputRun handler. */
	PreconditionMissingChatInputHandler = "preconditionMissingChatInputHandler",
	/** The check has no contextMenuRun handler. */
	PreconditionMissingContextMenuHandler = "preconditionMissingContextMenuHandler",
}
