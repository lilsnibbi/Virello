import { type Role } from "discord.js";
import type { Guild } from "discord.js";
import {
	RoleMentionRegex,
	SnowflakeRegex,
} from "../../../utilities/discord/constants/index";
import { Result } from "../../../../util/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Fetch a role by ID or mention, then try an exact case-insensitive cached name.
 * @param parameter - Role lookup text.
 * @param guild - Guild to search.
 * @returns The role, or ArgumentRoleError when no match exists.
 * @throws If the role fetch rejects.
 */
export async function resolveRole(
	parameter: string,
	guild: Guild,
): Promise<Result<Role, Identifiers.ArgumentRoleError>> {
	const role =
		(await resolveById(parameter, guild)) ?? resolveByQuery(parameter, guild);

	if (role) {
		return Result.ok(role);
	}

	return Result.err(Identifiers.ArgumentRoleError);
}

async function resolveById(
	argument: string,
	guild: Guild,
): Promise<Role | null> {
	const roleId =
		RoleMentionRegex.exec(argument) ?? SnowflakeRegex.exec(argument);
	if (!roleId) return null;
	return guild.roles.fetch(roleId[1]);
}
function resolveByQuery(argument: string, guild: Guild): Role | null {
	return (
		guild.roles.cache.find(
			(role) => role.name.toLowerCase() === argument.toLowerCase(),
		) ?? null
	);
}
