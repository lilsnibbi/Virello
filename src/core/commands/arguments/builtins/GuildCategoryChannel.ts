import type { CategoryChannel } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveGuildCategoryChannel } from "../resolvers/guildCategoryChannel";

export class GuildCategoryChannelArgument extends Argument<CategoryChannel> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guildCategoryChannel" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<CategoryChannel> {
		const { guild } = context.message;
		if (!guild) {
			return this.error({
				parameter,
				identifier: Identifiers.ArgumentGuildChannelMissingGuildError,
				message: "This command can only be used in a server.",
				context,
			});
		}

		const resolved = resolveGuildCategoryChannel(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message:
					"The argument did not resolve to a valid server category channel.",
				context: { ...context, guild },
			}),
		);
	}
}
