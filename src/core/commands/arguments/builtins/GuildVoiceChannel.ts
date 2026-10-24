import type { VoiceChannel } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveGuildVoiceChannel } from "../resolvers/guildVoiceChannel";

export class GuildVoiceChannelArgument extends Argument<VoiceChannel> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guildVoiceChannel" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<VoiceChannel> {
		const { guild } = context.message;
		if (!guild) {
			return this.error({
				parameter,
				identifier: Identifiers.ArgumentGuildChannelMissingGuildError,
				message: "This command can only be used in a server.",
				context,
			});
		}

		const resolved = resolveGuildVoiceChannel(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The given argument did not resolve to a valid voice channel.",
				context: { ...context, guild },
			}),
		);
	}
}
