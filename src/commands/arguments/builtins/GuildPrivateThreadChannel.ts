import type { APIPrivateThreadChannel as ThreadChannel } from "discord-api-types/v10";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveGuildPrivateThreadChannel } from "../resolvers/guildPrivateThreadChannel";

export class GuildPrivateThreadChannelArgument extends Argument<ThreadChannel> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guildPrivateThreadChannel" });
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

		const resolved = resolveGuildPrivateThreadChannel(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message:
					"The given argument did not resolve to a valid private thread.",
				context: { ...context, guild },
			}),
		);
	}
}
