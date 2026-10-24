import { Argument } from "../Argument";
import { type EmojiObject, resolveEmoji } from "../resolvers/emoji";

export class EmojiArgument extends Argument<EmojiObject> {
	public constructor(context: Argument.Context) {
		super(context, { name: "emoji" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<EmojiObject> {
		const resolved = resolveEmoji(parameter);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The argument did not resolve to an emoji.",
				context,
			}),
		);
	}
}
