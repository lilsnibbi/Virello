import type { GuildMember } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import type { MemberArgumentContext } from "../contexts";
import { resolveMember } from "../resolvers/member";

export class MemberArgument extends Argument<GuildMember> {
	public constructor(context: Argument.Context) {
		super(context, { name: "member" });
	}

	public async run(
		parameter: string,
		context: MemberArgumentContext,
	): Argument.AsyncResult<GuildMember> {
		const { guild } = context.message;

		if (!guild) {
			return this.error({
				parameter,
				identifier: Identifiers.ArgumentMemberMissingGuild,
				message: "This command can only be used in a server.",
				context,
			});
		}

		const resolved = await resolveMember(
			parameter,
			guild,
			context.performFuzzySearch ?? true,
		);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The given argument did not resolve to a server member.",
				context: { ...context, guild },
			}),
		);
	}
}
