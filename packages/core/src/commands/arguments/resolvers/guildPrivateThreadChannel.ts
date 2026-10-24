import type { APIPrivateThreadChannel as ThreadChannel } from "discord-api-types/v10";
import type { GuildReference as Guild } from "../../../discord/entities";
import { isPrivateThreadChannel } from "../../../utilities/discord/index";
import type { Result } from "@virello/util/result";
import { Identifiers } from "../../errors/Identifiers";
import { resolveGuildChannelPredicate } from "./internal/resolveGuildChannelPredicate";

/**
 * Resolve a cached guild channel by ID, mention, or exact case-insensitive name, then check its channel type.
 * @param parameter - Channel lookup text.
 * @param guild - Guild whose channel cache is searched.
 * @returns The requested channel type, or a not-found/type-mismatch identifier.
 */
export function resolveGuildPrivateThreadChannel(
	parameter: string,
	guild: Guild,
): Result<
	ThreadChannel,
	| Identifiers.ArgumentGuildChannelError
	| Identifiers.ArgumentGuildThreadChannelError
	| Identifiers.ArgumentGuildPrivateThreadChannelError
> {
	return resolveGuildChannelPredicate(
		parameter,
		guild,
		isPrivateThreadChannel,
		Identifiers.ArgumentGuildPrivateThreadChannelError,
	);
}
