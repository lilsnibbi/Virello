import type { APIGuild as Guild } from "discord-api-types/v10";
import { Argument } from "../Argument";
import { resolveGuild } from "../resolvers/guild";

export class GuildArgument extends Argument<Guild> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guild" });
	}

	public async run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.AsyncResult<Guild> {
		const resolved = await resolveGuild(parameter);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The given argument did not resolve to a Discord guild.",
				context,
			}),
		);
	}
}
