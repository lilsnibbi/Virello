import type { GuildBasedChannelTypes } from "../../../utilities/discord/index";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveGuildChannel } from "../resolvers/guildChannel";

export class GuildChannelArgument extends Argument<GuildBasedChannelTypes> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guildChannel" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<GuildBasedChannelTypes> {
		const { guild } = context.message;
		if (!guild) {
			return this.error({
				parameter,
				identifier: Identifiers.ArgumentGuildChannelMissingGuildError,
				message: "This command can only be used in a server.",
				context,
			});
		}

		const resolved = resolveGuildChannel(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The argument did not resolve to a valid server channel.",
				context: { ...context, guild },
			}),
		);
	}
}
