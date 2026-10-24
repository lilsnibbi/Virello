import type { Message } from "discord.js";
import { Argument } from "../Argument";
import type { MessageArgumentContext } from "../contexts";
import { resolveMessage } from "../resolvers/message";

export class MessageArgument extends Argument<Message> {
	public constructor(context: Argument.Context) {
		super(context, { name: "message" });
	}

	public async run(
		parameter: string,
		context: MessageArgumentContext,
	): Argument.AsyncResult<Message> {
		const channel = context.channel ?? context.message.channel;
		const resolved = await resolveMessage(parameter, {
			messageOrInteraction: context.message,
			channel: context.channel,
			scan: context.scan ?? false,
		});

		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The given argument did not resolve to a message.",
				context: { ...context, channel },
			}),
		);
	}
}
