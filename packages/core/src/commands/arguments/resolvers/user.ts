import type { Snowflake, APIUser as User } from "discord-api-types/v10";
import { container } from "../../../core/modules/index";
import {
	SnowflakeRegex,
	UserOrMemberMentionRegex,
} from "../../../utilities/discord/constants/index";
import { Result } from "@virello/util/result";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Fetch a Discord user by ID or mention.
 * @param parameter - User ID or mention.
 * @returns The user, or ArgumentUserError for invalid input or a failed fetch.
 */
export async function resolveUser(
	parameter: string,
): Promise<Result<User, Identifiers.ArgumentUserError>> {
	const userId =
		UserOrMemberMentionRegex.exec(parameter) ?? SnowflakeRegex.exec(parameter);
	const user = userId
		? await container.client.fetchUser(userId[1] as Snowflake).catch(() => null)
		: null;

	if (user) {
		return Result.ok(user);
	}

	return Result.err(Identifiers.ArgumentUserError);
}
