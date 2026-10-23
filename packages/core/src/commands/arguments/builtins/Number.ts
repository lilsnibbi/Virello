import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveNumber } from "../resolvers/number";

export class NumberArgument extends Argument<number> {
	private readonly messages = {
		[Identifiers.ArgumentNumberTooSmall]: ({ minimum }: Argument.RunContext) =>
			`The given number must be greater than ${minimum}.`,
		[Identifiers.ArgumentNumberTooLarge]: ({ maximum }: Argument.RunContext) =>
			`The given number must be less than ${maximum}.`,
		[Identifiers.ArgumentNumberError]: () =>
			"The argument did not resolve to a valid number.",
	} as const;

	public constructor(context: Argument.Context) {
		super(context, { name: "number" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<number> {
		const resolved = resolveNumber(parameter, {
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
