import type { StageChannel } from "discord.js";
import type { Guild } from "discord.js";
import { isStageChannel } from "../../../utilities/discord/index";
import type { Result } from "../../../../util/result/index";
import { Identifiers } from "../../errors/Identifiers";
import { resolveGuildChannelPredicate } from "./internal/resolveGuildChannelPredicate";

/**
 * Resolve a cached guild channel by ID, mention, or exact case-insensitive name, then check its channel type.
 * @param parameter - Channel lookup text.
 * @param guild - Guild whose channel cache is searched.
 * @returns The requested channel type, or a not-found/type-mismatch identifier.
 */
export function resolveGuildStageVoiceChannel(
	parameter: string,
	guild: Guild,
): Result<
	StageChannel,
	| Identifiers.ArgumentGuildChannelError
	| Identifiers.ArgumentGuildStageVoiceChannelError
> {
	return resolveGuildChannelPredicate(
		parameter,
		guild,
		isStageChannel,
		Identifiers.ArgumentGuildStageVoiceChannelError,
	);
}
