import { Routes, type APIRole as Role } from "discord-api-types/v10";
import type { GuildReference as Guild } from "../../../discord/entities";
import { container } from "../../../core/Container";
import {
	RoleMentionRegex,
	SnowflakeRegex,
} from "../../../utilities/discord/constants/index";
import { Result } from "@virello/util/result";
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
	const cached = container.client.cache.roles.get(guild.id, roleId[1]);
	if (cached?.complete) return cached.data;
	const roles = await container.client.rest.request<Role[]>({
		method: "GET",
		path: Routes.guildRoles(guild.id),
	});
	return roles.find((role) => role.id === roleId[1]) ?? null;
}

function resolveByQuery(argument: string, guild: Guild): Role | null {
	const lowerCaseArgument = argument.toLowerCase();
	return (
		([...container.client.cache.roles.values(guild.id)].find(
			(entry) =>
				entry.complete && entry.data.name.toLowerCase() === lowerCaseArgument,
		)?.data as Role | undefined) ?? null
	);
}
