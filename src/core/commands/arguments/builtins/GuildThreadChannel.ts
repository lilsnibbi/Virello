import type { ThreadChannel } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveGuildThreadChannel } from "../resolvers/guildThreadChannel";

export class GuildThreadChannelArgument extends Argument<ThreadChannel> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guildThreadChannel" });
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

		const resolved = resolveGuildThreadChannel(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The given argument did not resolve to a valid thread.",
				context: { ...context, guild },
			}),
		);
	}
}
