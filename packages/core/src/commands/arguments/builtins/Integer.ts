import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveInteger } from "../resolvers/integer";

export class IntegerArgument extends Argument<number> {
	private readonly messages = {
		[Identifiers.ArgumentIntegerTooSmall]: ({ minimum }: Argument.RunContext) =>
			`The given number must be greater than ${minimum}.`,
		[Identifiers.ArgumentIntegerTooLarge]: ({ maximum }: Argument.RunContext) =>
			`The given number must be less than ${maximum}.`,
		[Identifiers.ArgumentIntegerError]: () =>
			"The argument did not resolve to a valid number.",
	} as const;

	public constructor(context: Argument.Context) {
		super(context, { name: "integer" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<number> {
		const resolved = resolveInteger(parameter, {
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
