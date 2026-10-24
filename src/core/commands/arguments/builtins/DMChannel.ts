import type { DMChannel } from "discord.js";
import { Argument } from "../Argument";
import { resolveDMChannel } from "../resolvers/dmChannel";

export class DMChannelArgument extends Argument<DMChannel> {
	public constructor(context: Argument.Context) {
		super(context, { name: "dmChannel" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<DMChannel> {
		const resolved = resolveDMChannel(parameter, context.message);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The argument did not resolve to a DM channel.",
				context,
			}),
		);
	}
}
