import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveFloat } from "../resolvers/float";

export class FloatArgument extends Argument<number> {
	private readonly messages = {
		[Identifiers.ArgumentFloatTooSmall]: ({ minimum }: Argument.RunContext) =>
			`The given number must be greater than ${minimum}.`,
		[Identifiers.ArgumentFloatTooLarge]: ({ maximum }: Argument.RunContext) =>
			`The given number must be less than ${maximum}.`,
		[Identifiers.ArgumentFloatError]: () =>
			"The argument did not resolve to a valid decimal.",
	} as const;

	public constructor(context: Argument.Context) {
		super(context, { name: "float" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<number> {
		const resolved = resolveFloat(parameter, {
			minimum: context.minimum,
			maximum: context.maximum,
		});
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: this.messages[identifier](context),
				context,
			}),
		);
	}
}
