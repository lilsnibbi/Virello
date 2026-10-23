import type { ChannelTypes } from "../../../utilities/discord/index";
import { Argument } from "../Argument";
import { resolveChannel } from "../resolvers/channel";

export class ChannelArgument extends Argument<ChannelTypes> {
	public constructor(context: Argument.Context) {
		super(context, { name: "channel" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<ChannelTypes> {
		const resolved = resolveChannel(parameter, context.message);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The argument did not resolve to a channel.",
				context,
			}),
		);
	}
}
