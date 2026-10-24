import { Argument } from "../Argument";
import type { BooleanArgumentContext } from "../contexts";
import { resolveBoolean } from "../resolvers/boolean";

export class BooleanArgument extends Argument<boolean> {
	public constructor(context: Argument.Context) {
		super(context, { name: "boolean" });
	}

	public run(
		parameter: string,
		context: BooleanArgumentContext,
	): Argument.Result<boolean> {
		const resolved = resolveBoolean(parameter, {
			truths: context.truths,
			falses: context.falses,
		});
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The argument did not resolve to a boolean.",
				context,
			}),
		);
	}
}
