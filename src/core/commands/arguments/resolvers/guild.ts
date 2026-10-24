import { type Guild } from "discord.js";
import { container } from "../../../core/modules/index";
import { SnowflakeRegex } from "../../../utilities/discord/constants/index";
import { Result } from "../../../../util/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Fetch a guild by snowflake.
 * @param parameter - Guild ID.
 * @returns The guild, or ArgumentGuildError for invalid input or a failed fetch.
 */
export async function resolveGuild(
	parameter: string,
): Promise<Result<Guild, Identifiers.ArgumentGuildError>> {
	const guildId = SnowflakeRegex.exec(parameter)?.groups?.id;
	const guild = guildId
		? await container.client.guilds.fetch(guildId).catch(() => null)
		: null;

	if (guild) {
		return Result.ok(guild);
	}

	return Result.err(Identifiers.ArgumentGuildError);
}
