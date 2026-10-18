import type { APIGuildMember, APIUser } from "discord-api-types/v10";
import { record } from "../common";
import type { $Patch } from "./types";

type MemberVisitor = (
	guildId: string,
	userId: string,
	member?: $Patch<APIGuildMember>,
) => void;

/** Structural discovery handles member activity across event kinds, including future events. */
export function visitActivity(
	data: unknown,
	guildId: string | undefined,
	visit: MemberVisitor,
): void {
	function walk(
		value: unknown,
		guild: string | undefined,
		depth: number,
	): void {
		if (depth > 32)
			throw new Error("Gateway activity nesting exceeds 32 levels.");
		if (Array.isArray(value)) {
			for (const child of value) walk(child, guild, depth + 1);
			return;
		}
		if (!record(value)) return;
		const scope = typeof value.guild_id === "string" ? value.guild_id : guild;
		if (scope) {
			const user = record(value.user)
				? value.user
				: record(value.author)
					? value.author
					: undefined;
			const userId =
				typeof value.user_id === "string" ? value.user_id : user?.id;
			if (typeof userId === "string") visit(scope, userId);
			if (record(value.member)) {
				const embedded = value.member;
				const { member: _member, ...mentionUser } = value;
				const memberUser = record(embedded.user)
					? embedded.user
					: (user ??
						(typeof value.id === "string" && typeof value.username === "string"
							? mentionUser
							: undefined));
				const id = typeof memberUser?.id === "string" ? memberUser.id : userId;
				if (typeof id === "string")
					visit(scope, id, {
						...embedded,
						...(memberUser ? { user: memberUser as $Patch<APIUser> } : {}),
					});
			}
			if (record(value.members)) {
				const users = record(value.users) ? value.users : {};
				for (const [id, member] of Object.entries(value.members)) {
					if (!record(member)) continue;
					const resolvedUser = users[id];
					visit(scope, id, {
						...member,
						...(record(resolvedUser)
							? { user: resolvedUser as $Patch<APIUser> }
							: {}),
					});
				}
			}
		}
		for (const [key, child] of Object.entries(value)) {
			if (scope && /(?:user|member)_ids$/.test(key) && Array.isArray(child))
				for (const id of child) if (typeof id === "string") visit(scope, id);
		}
		for (const child of Object.values(value))
			if (typeof child === "object" && child !== null)
				walk(child, scope, depth + 1);
	}
	walk(data, guildId, 0);
}
