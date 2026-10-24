import { ChannelType } from "discord-api-types/v10";
import { type DMChannel } from "discord.js";
import type { Message } from "discord.js";
import type { PartialDMChannel } from "discord.js";
import { ChannelMentionRegex } from "../../../utilities/discord/constants/regexes";
import { Result } from "../../../../util/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Resolve a cached DM channel by ID or mention, allowing partial channels.
 * @param parameter - Channel ID or mention.
 * @param message - Invocation selecting the cache.
 * @returns A full or partial DM channel, or a not-found/type-mismatch identifier.
 */
export function resolvePartialDMChannel(
	parameter: string,
	message: Message,
): Result<
	DMChannel | PartialDMChannel,
	Identifiers.ArgumentChannelError | Identifiers.ArgumentDMChannelError
> {
	const id = ChannelMentionRegex.exec(parameter)?.[1] ?? parameter;
	const channel = message.client.channels.cache.get(id);
	if (!channel || message.guildId)
		return Result.err(Identifiers.ArgumentChannelError);
	if (channel.type !== ChannelType.DM)
		return Result.err(Identifiers.ArgumentDMChannelError);
	return Result.ok(channel);
}
