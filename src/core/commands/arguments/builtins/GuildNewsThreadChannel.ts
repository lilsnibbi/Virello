import type { PublicThreadChannel as ThreadChannel } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveGuildNewsThreadChannel } from "../resolvers/guildNewsThreadChannel";

export class GuildNewsThreadChannelArgument extends Argument<ThreadChannel> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guildNewsThreadChannel" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<ThreadChannel> {
		const { guild } = context.message;
		if (!guild) {
			return this.error({
				parameter,
				identifier: Identifiers.ArgumentGuildChannelMissingGuildError,
				message: "This command can only be used in a server.",
				context,
			});
		}

		const resolved = resolveGuildNewsThreadChannel(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message:
					"The given argument did not resolve to a valid announcements thread.",
				context: { ...context, guild },
			}),
		);
	}
}
