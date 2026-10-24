/** Match the ID in Discord Channel mentions */
export const ChannelMentionRegex = /^<#(?<id>\d{17,20})>$/;

/** Match the channel and message IDs in a channelId-messageId pattern This pattern can be found when you hold Shift and hover over a message, and click the "ID" button */
export const ChannelMessageRegex =
	/^(?<channelId>\d{17,20})-(?<messageId>\d{17,20})$/;

/** Match links on the known Discord host names */
export const DiscordHostnameRegex =
	/(?<subdomain>\w+)\.?(?<hostname>dis(?:cord)?(?:app|merch|status)?)\.(?<tld>com|g(?:d|g|ift)|(?:de(?:sign|v))|media|new|store|net)/i;

/** Match the code of Discord invite links */
export const DiscordInviteLinkRegex =
	/(?:^|\b)discord(?:(?:app)?\.com\/invite|\.gg(?:\/invite)?)\/(?<code>[\w-]{2,255})(?:$|\b)/gi;

/** Match the ID of any animated or non-animated custom Discord emoji */
export const EmojiRegex =
	/^(?:<(?<animated>a)?:(?<name>\w{2,32}):)?(?<id>\d{17,21})>?$/;

/** Match any animated or non-animated custom Discord emoji. Unlike {@link EmojiRegex} It can be a substring of a larger string. */
export const FormattedCustomEmoji = /<a?:\w{2,32}:\d{17,20}>/;

/** Match any animated or non-animated custom Discord emoji. Similar to {@link FormattedCustomEmoji} and unlike {@link EmojiRegex} can also be a substring of a larger string. */
export const FormattedCustomEmojiWithGroups =
	/(?<animated>a?):(?<name>[^:]+):(?<id>\d{17,20})/;

/** Match any URL starting with `http` or `https` */
export const HttpUrlRegex = /^https?:\/\//;

/** Match the Guild, Channel, and Message ID based on a shareable Discord message link. */
export const MessageLinkRegex =
	/^(?:https:\/\/)?(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(?<guildId>(?:\d{17,20}|@me))\/(?<channelId>\d{17,20})\/(?<messageId>\d{17,20})$/;

/** Match any animated or non-animated custom Discord emoji *without the wrapping `<...>` symbols. */
export const ParsedCustomEmoji = /a?:\w{2,32}:\d{17,20}/;

/** Match any animated or non-animated custom Discord emoji *without the wrapping `<...>` symbols. */
export const ParsedCustomEmojiWithGroups =
	/(?<animated>a?):(?<name>[^:]+):(?<id>\d{17,20})/;

/** Match the ID in Discord Role mentions */
export const RoleMentionRegex = /^<@&(?<id>\d{17,20})>$/;

/** Match any Discord Snowflake ID */
export const SnowflakeRegex = /^(?<id>\d{17,20})$/;

/** Match a Discord Token */
export const TokenRegex =
	/(?<mfaToken>mfa\.[a-z0-9_-]{20 })|(?<basicToken>[a-z0-9_-]{23,28}\.[a-z0-9_-]{6,7}\.[a-z0-9_-]{27})/i;

/** Match the ID of a user in Discord user mentions */
export const UserOrMemberMentionRegex = /^<@!?(?<id>\d{17,20})>$/;

/** Match any WebSocket URL starting with `ws` or `wss` */
export const WebSocketUrlRegex = /^wss?:\/\//;

/** Regex that captures the Webhook ID and token from a Discord Webhook URL. */
export const WebhookRegex =
	/(?<url>^https:\/\/(?:(?:canary|ptb).)?discord(?:app)?.com\/api(?:\/v\d+)?\/webhooks\/(?<id>\d+)\/(?<token>[\w-]+)\/?$)/;
