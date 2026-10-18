import type { APIGuildCategoryChannel as CategoryChannel } from "discord-api-types/v10";
import type { GuildReference as Guild } from "../../../discord/entities";
import { isCategoryChannel } from "../../../utilities/discord/index";
import type { Result } from "../../../utilities/result/index";
import { Identifiers } from "../../errors/Identifiers";
import { resolveGuildChannelPredicate } from "./internal/resolveGuildChannelPredicate";

/**
 * Resolve a cached guild channel by ID, mention, or exact case-insensitive name, then check its channel type.
 * @param parameter - Channel lookup text.
 * @param guild - Guild whose channel cache is searched.
 * @returns The requested channel type, or a not-found/type-mismatch identifier.
 */
export function resolveGuildCategoryChannel(
	parameter: string,
	guild: Guild,
): Result<
	CategoryChannel,
	| Identifiers.ArgumentGuildChannelError
	| Identifiers.ArgumentGuildCategoryChannelError
> {
	return resolveGuildChannelPredicate(
		parameter,
		guild,
		isCategoryChannel,
		Identifiers.ArgumentGuildCategoryChannelError,
	);
}
