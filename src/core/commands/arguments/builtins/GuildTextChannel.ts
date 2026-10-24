import type { TextChannel } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveGuildTextChannel } from "../resolvers/guildTextChannel";

export class GuildTextChannelArgument extends Argument<TextChannel> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guildTextChannel" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<TextChannel> {
		const { guild } = context.message;
		if (!guild) {
			return this.error({
				parameter,
				identifier: Identifiers.ArgumentGuildChannelMissingGuildError,
				message: "This command can only be used in a server.",
				context,
			});
		}

		const resolved = resolveGuildTextChannel(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The given argument did not resolve to a valid text channel.",
				context: { ...context, guild },
			}),
		);
	}
}
