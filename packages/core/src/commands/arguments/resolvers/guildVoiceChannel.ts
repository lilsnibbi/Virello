import type { APIGuildVoiceChannel as VoiceChannel } from "discord-api-types/v10";
import type { GuildReference as Guild } from "../../../discord/entities";
import { isVoiceChannel } from "../../../utilities/discord/index";
import type { Result } from "@virello/util/result";
import { Identifiers } from "../../errors/Identifiers";
import { resolveGuildChannelPredicate } from "./internal/resolveGuildChannelPredicate";

/**
 * Resolve a cached guild channel by ID, mention, or exact case-insensitive name, then check its channel type.
 * @param parameter - Channel lookup text.
 * @param guild - Guild whose channel cache is searched.
 * @returns The requested channel type, or a not-found/type-mismatch identifier.
 */
export function resolveGuildVoiceChannel(
	parameter: string,
	guild: Guild,
): Result<
	VoiceChannel,
	| Identifiers.ArgumentGuildChannelError
	| Identifiers.ArgumentGuildVoiceChannelError
> {
	return resolveGuildChannelPredicate(
		parameter,
		guild,
		isVoiceChannel,
		Identifiers.ArgumentGuildVoiceChannelError,
	);
}
