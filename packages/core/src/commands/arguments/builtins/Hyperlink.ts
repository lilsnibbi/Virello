import type { URL } from "node:url";
import { Argument } from "../Argument";
import { resolveHyperlink } from "../resolvers/hyperlink";

export class HyperlinkArgument extends Argument<URL> {
	public constructor(context: Argument.Context) {
		super(context, { name: "hyperlink", aliases: ["url"] });
	}

	public run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.Result<URL> {
		const resolved = resolveHyperlink(parameter);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The argument did not resolve to a valid URL.",
				context,
			}),
		);
	}
}
