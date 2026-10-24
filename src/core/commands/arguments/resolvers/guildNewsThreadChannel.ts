import type { PublicThreadChannel as ThreadChannel } from "discord.js";
import type { Guild } from "discord.js";
import { isNewsThreadChannel } from "../../../utilities/discord/index";
import type { Result } from "../../../../util/result/index";
import { Identifiers } from "../../errors/Identifiers";
import { resolveGuildChannelPredicate } from "./internal/resolveGuildChannelPredicate";

/**
 * Resolve a cached guild channel by ID, mention, or exact case-insensitive name, then check its channel type.
 * @param parameter - Channel lookup text.
 * @param guild - Guild whose channel cache is searched.
 * @returns The requested channel type, or a not-found/type-mismatch identifier.
 */
export function resolveGuildNewsThreadChannel(
	parameter: string,
	guild: Guild,
): Result<
	ThreadChannel,
	| Identifiers.ArgumentGuildChannelError
	| Identifiers.ArgumentGuildThreadChannelError
	| Identifiers.ArgumentGuildNewsThreadChannelError
> {
	return resolveGuildChannelPredicate(
		parameter,
		guild,
		isNewsThreadChannel,
		Identifiers.ArgumentGuildNewsThreadChannelError,
	);
}
