import type { StageChannel } from "discord.js";
import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveGuildStageVoiceChannel } from "../resolvers/guildStageVoiceChannel";

export class GuildStageVoiceChannelArgument extends Argument<StageChannel> {
	public constructor(context: Argument.Context) {
		super(context, { name: "guildStageVoiceChannel" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<StageChannel> {
		const { guild } = context.message;
		if (!guild) {
			return this.error({
				parameter,
				identifier: Identifiers.ArgumentGuildChannelMissingGuildError,
				message: "This command can only be used in a server.",
				context,
			});
		}

		const resolved = resolveGuildStageVoiceChannel(parameter, guild);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message:
					"The given argument did not resolve to a valid stage voice channel.",
				context: { ...context, guild },
			}),
		);
	}
}
