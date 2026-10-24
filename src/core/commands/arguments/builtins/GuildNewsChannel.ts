import type { NewsChannel } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveGuildNewsChannel } from "../resolvers/guildNewsChannel";

export class GuildNewsChannelArgument extends Argument<NewsChannel> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guildNewsChannel" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<NewsChannel> {
		const { guild } = context.message;
		if (!guild) {
			return this.error({
				parameter,
				identifier: Identifiers.ArgumentGuildChannelMissingGuildError,
				message: "This command can only be used in a server.",
				context,
			});
		}

		const resolved = resolveGuildNewsChannel(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message:
					"The given argument did not resolve to a valid announcements channel.",
				context: { ...context, guild },
			}),
		);
	}
}
