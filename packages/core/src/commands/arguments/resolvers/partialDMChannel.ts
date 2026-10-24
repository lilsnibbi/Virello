import {
	ChannelType,
	type APIDMChannel as DMChannel,
} from "discord-api-types/v10";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import type { PartialDMChannel } from "../../../discord/entities";
import { ChannelMentionRegex } from "../../../utilities/discord/constants/regexes";
import { Result } from "@virello/util/result";
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
	const entry = message.client.cache.channels.get(id);
	if (!entry || message.guildId)
		return Result.err(Identifiers.ArgumentChannelError);
	if (entry.data.type !== ChannelType.DM)
		return Result.err(Identifiers.ArgumentDMChannelError);
	return Result.ok({
		...entry.data,
		id,
		type: ChannelType.DM,
	} as PartialDMChannel);
}
