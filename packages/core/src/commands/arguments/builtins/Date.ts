import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveDate } from "../resolvers/date";

export class DateArgument extends Argument<Date> {
	private readonly messages = {
		[Identifiers.ArgumentDateTooEarly]: ({ minimum }: Argument.RunContext) =>
			`The given date must be after ${new Date(minimum!).toISOString()}.`,
		[Identifiers.ArgumentDateTooFar]: ({ maximum }: Argument.RunContext) =>
			`The given date must be before ${new Date(maximum!).toISOString()}.`,
		[Identifiers.ArgumentDateError]: () =>
			"The argument did not resolve to a date.",
	} as const;

	public constructor(context: Argument.Context) {
		super(context, { name: "date" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<Date> {
		const resolved = resolveDate(parameter, {
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
