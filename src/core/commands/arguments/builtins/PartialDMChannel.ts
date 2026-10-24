import type { DMChannel } from "discord.js";
import type { PartialDMChannel } from "discord.js";
import { Argument } from "../Argument";
import { resolvePartialDMChannel } from "../resolvers/partialDMChannel";

export class PartialDMChannelArgument extends Argument<
	DMChannel | PartialDMChannel
> {
	public constructor(context: Argument.Context) {
		super(context, { name: "partialDMChannel" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<DMChannel | PartialDMChannel> {
		const resolved = resolvePartialDMChannel(parameter, context.message);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The argument did not resolve to a Partial DM channel.",
				context,
			}),
		);
	}
}
