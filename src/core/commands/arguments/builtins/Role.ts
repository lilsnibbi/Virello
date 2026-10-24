import type { Role } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveRole } from "../resolvers/role";

export class RoleArgument extends Argument<Role> {
	public constructor(context: Argument.Context) {
		super(context, { name: "role" });
	}

	public async run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.AsyncResult<Role> {
		const { guild } = context.message;
		if (!guild) {
			return this.error({
				parameter,
				identifier: Identifiers.ArgumentRoleMissingGuild,
				message: "This command can only be used in a server.",
				context,
			});
		}

		const resolved = await resolveRole(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The given argument did not resolve to a role.",
				context: { ...context, guild },
			}),
		);
	}
}
