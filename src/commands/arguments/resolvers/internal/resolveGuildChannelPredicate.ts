import type { GuildReference as Guild } from "../../../../discord/entities";
import type {
	ChannelTypes,
	GuildBasedChannelTypes,
} from "../../../../utilities/discord/index";
import type { Nullish } from "../../../../utilities/index";
import { Result } from "../../../../utilities/result/index";
import type { Identifiers } from "../../../errors/Identifiers";
import { resolveGuildChannel } from "../guildChannel";

export function resolveGuildChannelPredicate<
	TChannel extends GuildBasedChannelTypes,
	TError extends Identifiers,
>(
	parameter: string,
	guild: Guild,
	predicate: (channel: ChannelTypes | Nullish) => channel is TChannel,
	error: TError,
): Result<TChannel, TError | Identifiers.ArgumentGuildChannelError> {
	const result = resolveGuildChannel(parameter, guild);
	return result.mapInto((channel) =>
		predicate(channel) ? Result.ok(channel) : Result.err(error),
	);
}
