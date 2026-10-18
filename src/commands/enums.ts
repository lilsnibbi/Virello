/** Named cooldown grouping labels. */
export enum CooldownLevel {
	/** Group uses by the invoking author. */
	Author = "author",
	/** Group uses by channel. */
	Channel = "channel",
	/** Group uses by guild. */
	Guild = "guild",
}

/** The scope the cooldown applies to. */
export enum BucketScope {
	/** Per channel cooldowns. */
	Channel,
	/** Global cooldowns. */
	Global,
	/** Per guild cooldowns. */
	Guild,
	/** Per user cooldowns. */
	User,
}

/** Action to take when a Discord command differs from the local registration. */
export enum RegisterBehavior {
	/** Update the existing command to match local data. */
	Overwrite = "OVERWRITE",
	/** Log differences and leave the existing Discord command unchanged. */
	LogToConsole = "LOG_TO_CONSOLE",
	/** Log detailed differences, then update the command. */
	VerboseOverwrite = "VERBOSE_OVERWRITE",
	/** Replace command lists for global and configured guild scopes. Configure this as the shared default. */
	BulkOverwrite = "BULK_OVERWRITE",
}

/** Command categories used by registry bookkeeping. */
export enum InternalRegistryAPIType {
	/** Slash command registration. */
	ChatInput,
	/** User or message context-menu registration. */
	ContextMenu,
}

/** The allowed values for {@link CommandOptions.runIn} as an enum. */
export enum CommandOptionsRunTypeEnum {
	/** Direct-message channels. */
	Dm = "DM",
	/** Guild text channels. */
	GuildText = "GUILD_TEXT",
	/** Guild voice channels. */
	GuildVoice = "GUILD_VOICE",
	/** Guild announcement channels. */
	GuildNews = "GUILD_NEWS",
	/** Announcement threads. */
	GuildNewsThread = "GUILD_NEWS_THREAD",
	/** Public threads. */
	GuildPublicThread = "GUILD_PUBLIC_THREAD",
	/** Private threads. */
	GuildPrivateThread = "GUILD_PRIVATE_THREAD",
	/** Every non-DM channel type known to discord.js. */
	GuildAny = "GUILD_ANY",
}

/** The available command pre-conditions. */
export enum CommandPreConditions {
	/** Registered command cooldown check name. */
	Cooldown = "Cooldown",
	/** @deprecated Use {@link RunIn} instead. */
	DirectMessageOnly = "DMOnly",
	/** Registered allowed-channel check name. */
	RunIn = "RunIn",
	/** @deprecated Use {@link RunIn} instead. */
	GuildNewsOnly = "GuildNewsOnly",
	/** @deprecated Use {@link RunIn} instead. */
	GuildNewsThreadOnly = "GuildNewsThreadOnly",
	/** @deprecated Use {@link RunIn} instead. */
	GuildOnly = "GuildOnly",
	/** @deprecated Use {@link RunIn} instead. */
	GuildPrivateThreadOnly = "GuildPrivateThreadOnly",
	/** @deprecated Use {@link RunIn} instead. */
	GuildPublicThreadOnly = "GuildPublicThreadOnly",
	/** @deprecated Use {@link RunIn} instead. */
	GuildTextOnly = "GuildTextOnly",
	/** @deprecated Use {@link RunIn} instead. */
	GuildVoiceOnly = "GuildVoiceOnly",
	/** @deprecated Use {@link RunIn} instead. */
	GuildThreadOnly = "GuildThreadOnly",
	/** Registered NSFW channel check name. */
	NotSafeForWork = "NSFW",
	/** Registered bot permission check name. */
	ClientPermissions = "ClientPermissions",
	/** Registered invoking-user permission check name. */
	UserPermissions = "UserPermissions",
}
