import { Routes, type APIGuild as Guild } from "discord-api-types/v10";
import { container } from "../../../core/modules/index";
import { SnowflakeRegex } from "../../../utilities/discord/constants/index";
import { Result } from "../../../utilities/result/index";
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
		? await container.client.rest
				.request<Guild>({ method: "GET", path: Routes.guild(guildId) })
				.catch(() => null)
		: null;

	if (guild) {
		return Result.ok(guild);
	}

	return Result.err(Identifiers.ArgumentGuildError);
}
