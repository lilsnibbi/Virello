import {
	Routes,
	type APIGuildMember as GuildMember,
	type Snowflake,
} from "discord-api-types/v10";
import type { GuildReference as Guild } from "../../../discord/entities";
import { container } from "../../../core/Container";
import {
	SnowflakeRegex,
	UserOrMemberMentionRegex,
} from "../../../utilities/discord/constants/index";
import { isNullish } from "../../../utilities/index";
import { Result } from "../../../utilities/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Fetch a guild member by ID or mention, with an optional one-result name query fallback.
 * @param parameter - User ID, mention, or name query.
 * @param guild - Guild to search.
 * @param performFuzzySearch - Allow the name query after ID resolution fails. Defaults to false.
 * @returns The member, or ArgumentMemberError when no fetch succeeds.
 */
export async function resolveMember(
	parameter: string,
	guild: Guild,
	performFuzzySearch?: boolean,
): Promise<Result<GuildMember, Identifiers.ArgumentMemberError>> {
	let member = await resolveById(parameter, guild);

	if (isNullish(member) && performFuzzySearch) {
		member = await resolveByQuery(parameter, guild);
	}

	if (member) {
		return Result.ok(member);
	}

	return Result.err(Identifiers.ArgumentMemberError);
}

async function resolveById(
	argument: string,
	guild: Guild,
): Promise<GuildMember | null> {
	const memberId =
		UserOrMemberMentionRegex.exec(argument) ?? SnowflakeRegex.exec(argument);
	return memberId
		? container.client.engine
				.fetchMember(guild.id, memberId[1] as Snowflake)
				.catch(() => null)
		: null;
}

async function resolveByQuery(
	argument: string,
	guild: Guild,
): Promise<GuildMember | null> {
	argument =
		argument.length > 5 && argument.at(-5) === "#"
			? argument.slice(0, -5)
			: argument;

	const members = await container.client.rest
		.request<GuildMember[]>({
			method: "GET",
			path: `${Routes.guildMembersSearch(guild.id)}?query=${encodeURIComponent(argument)}&limit=1`,
		})
		.catch(() => null);
	return members?.[0] ?? null;
}
