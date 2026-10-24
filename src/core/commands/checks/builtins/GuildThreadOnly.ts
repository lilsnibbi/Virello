import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "discord.js";
import type { Message } from "discord.js";
import { isThreadChannel } from "../../../utilities/discord/type-guards";
import { Identifiers } from "../../errors/Identifiers";
import { AllFlowsPrecondition } from "../Precondition";

/**
 * Apply the legacy thread check. Available through CorePreconditions.
 * @deprecated Use the RunIn check with explicit channel types.
 */
export class GuildThreadOnlyCheck extends AllFlowsPrecondition {
	/**
	 * Check a message invocation. Apply the legacy thread check. This legacy message flow examines message.thread.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public messageRun(message: Message): AllFlowsPrecondition.Result {
		return message.thread ? this.ok() : this.makeSharedError();
	}

	/**
	 * Check a slash invocation. Apply the legacy thread check.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public async chatInputRun(
		interaction: ChatInputCommandInteraction,
	): AllFlowsPrecondition.AsyncResult {
		const channel = await this.fetchChannelFromInteraction(interaction);
		return isThreadChannel(channel) ? this.ok() : this.makeSharedError();
	}

	/**
	 * Check a context-menu invocation. Apply the legacy thread check.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public async contextMenuRun(
		interaction: ContextMenuCommandInteraction,
	): AllFlowsPrecondition.AsyncResult {
		const channel = await this.fetchChannelFromInteraction(interaction);
		return isThreadChannel(channel) ? this.ok() : this.makeSharedError();
	}

	private makeSharedError(): AllFlowsPrecondition.Result {
		return this.error({
			identifier: Identifiers.PreconditionThreadOnly,
			message: "You can only run this command in server thread channels.",
		});
	}
}
