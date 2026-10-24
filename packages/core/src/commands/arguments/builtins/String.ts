import { Identifiers } from "../../errors/Identifiers";
import { Argument } from "../Argument";
import { resolveString } from "../resolvers/string";

export class StringArgument extends Argument<string> {
	private readonly messages = {
		[Identifiers.ArgumentStringTooShort]: ({ minimum }: Argument.RunContext) =>
			`The argument must be longer than ${minimum} characters.`,
		[Identifiers.ArgumentStringTooLong]: ({ maximum }: Argument.RunContext) =>
			`The argument must be shorter than ${maximum} characters.`,
	} as const;

	public constructor(context: Argument.Context) {
		super(context, { name: "string" });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<string> {
		const resolved = resolveString(parameter, {
			minimum: context?.minimum,
			maximum: context?.maximum,
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
