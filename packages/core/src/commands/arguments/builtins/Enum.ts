import { Argument } from "../Argument";
import type { EnumArgumentContext } from "../contexts";
import { resolveEnum } from "../resolvers/enum";

export class EnumArgument extends Argument<string> {
	public constructor(context: Argument.Context) {
		super(context, { name: "enum" });
	}

	public run(
		parameter: string,
		context: EnumArgumentContext,
	): Argument.Result<string> {
		const resolved = resolveEnum(parameter, {
			enum: context.enum,
			caseInsensitive: context.caseInsensitive,
		});
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: `The argument must have one of the following values: ${context.enum?.join(", ")}`,
				context,
			}),
		);
	}
}
