import type { PublicThreadChannel as ThreadChannel } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveGuildPublicThreadChannel } from "../resolvers/guildPublicThreadChannel";

export class GuildPublicThreadChannelArgument extends Argument<ThreadChannel> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guildPublicThreadChannel" });
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

		const resolved = resolveGuildPublicThreadChannel(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The given argument did not resolve to a valid public thread.",
				context: { ...context, guild },
			}),
		);
	}
}
