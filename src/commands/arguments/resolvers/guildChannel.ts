import type { GuildReference as Guild } from "../../../discord/entities";
import { container } from "../../../core/Container";
import { isGuildBasedChannel } from "../../../utilities/discord/type-guards";
import {
	ChannelMentionRegex,
	SnowflakeRegex,
} from "../../../utilities/discord/constants/index";
import type { GuildBasedChannelTypes } from "../../../utilities/discord/index";
import { Result } from "../../../utilities/result/index";
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
	if (
		!channelId ||
		container.client.cache.guildForChannel(channelId[1]) !== guild.id
	)
		return null;
	const entry = container.client.cache.channels.get(channelId[1]);
	return entry?.complete && isGuildBasedChannel(entry.data) ? entry.data : null;
}

function resolveByQuery(
	argument: string,
	guild: Guild,
): GuildBasedChannelTypes | null {
	const lowerCaseArgument = argument.toLowerCase();
	for (const [id, entry] of container.client.cache.channels)
		if (
			entry.complete &&
			container.client.cache.guildForChannel(id) === guild.id &&
			isGuildBasedChannel(entry.data) &&
			entry.data.name?.toLowerCase() === lowerCaseArgument
		)
			return entry.data;
	return null;
}
