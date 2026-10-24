import type { User } from "discord.js";
import { Argument } from "../Argument";
import { resolveUser } from "../resolvers/user";

export class UserArgument extends Argument<User> {
	public constructor(context: Argument.Context) {
		super(context, { name: "user" });
	}

	public async run(
		parameter: string,
		context: Argument.RunContext,
	): Argument.AsyncResult<User> {
		const resolved = await resolveUser(parameter);
		return resolved.mapErrInto((identifier) =>
			this.error({
				parameter,
				identifier,
				message: "The given argument did not resolve to a Discord user.",
				context,
			}),
		);
	}
}
