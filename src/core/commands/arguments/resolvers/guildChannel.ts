import type { Guild } from "discord.js";
import {
	ChannelMentionRegex,
	SnowflakeRegex,
} from "../../../utilities/discord/constants/index";
import type { GuildBasedChannelTypes } from "../../../utilities/discord/index";
import { Result } from "../../../../util/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Look up a cached guild channel by ID, mention, or exact case-insensitive name.
 * @param parameter - Channel lookup text.
 * @param guild - Guild whose channel cache is searched.
 * @returns The channel, or ArgumentGuildChannelError.
 */
export function resolveGuildChannel(
	parameter: string,
	guild: Guild,
): Result<GuildBasedChannelTypes, Identifiers.ArgumentGuildChannelError> {
	const channel =
		resolveById(parameter, guild) ?? resolveByQuery(parameter, guild);

	if (channel) {
		return Result.ok(channel);
	}

	return Result.err(Identifiers.ArgumentGuildChannelError);
}

function resolveById(
	argument: string,
	guild: Guild,
): GuildBasedChannelTypes | null {
	const channelId =
		ChannelMentionRegex.exec(argument) ?? SnowflakeRegex.exec(argument);
	return channelId ? (guild.channels.cache.get(channelId[1]) ?? null) : null;
}
function resolveByQuery(
	argument: string,
	guild: Guild,
): GuildBasedChannelTypes | null {
	return (
		guild.channels.cache.find(
			(channel) => channel.name.toLowerCase() === argument.toLowerCase(),
		) ?? null
	);
}
