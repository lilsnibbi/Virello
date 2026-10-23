import { ChannelType } from "discord-api-types/v10";
import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "../../../discord/InteractionContext";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import { Identifiers } from "../../errors/Identifiers";
import { AllFlowsPrecondition } from "../Precondition";

/**
 * Apply the legacy announcement-thread check. Available through CorePreconditions.
 * @deprecated Use the RunIn check with explicit channel types.
 */
export class GuildNewsThreadOnlyCheck extends AllFlowsPrecondition {
	/**
	 * Check a message invocation. Apply the legacy announcement-thread check. This legacy message flow examines
	 * message.thread.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public messageRun(message: Message): AllFlowsPrecondition.Result {
		return message.thread?.type === ChannelType.AnnouncementThread
			? this.ok()
			: this.makeSharedError();
	}

	/**
	 * Check a slash invocation. Apply the legacy announcement-thread check.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public async chatInputRun(
		interaction: ChatInputCommandInteraction,
	): AllFlowsPrecondition.AsyncResult {
		const channel = await this.fetchChannelFromInteraction(interaction);
		return channel.type === ChannelType.AnnouncementThread
			? this.ok()
			: this.makeSharedError();
	}

	/**
	 * Check a context-menu invocation. Apply the legacy announcement-thread check.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public async contextMenuRun(
		interaction: ContextMenuCommandInteraction,
	): AllFlowsPrecondition.AsyncResult {
		const channel = await this.fetchChannelFromInteraction(interaction);
		return channel.type === ChannelType.AnnouncementThread
			? this.ok()
			: this.makeSharedError();
	}

	private makeSharedError(): AllFlowsPrecondition.Result {
		return this.error({
			identifier: Identifiers.PreconditionGuildNewsThreadOnly,
			message:
				"You can only run this command in server announcement thread channels.",
		});
	}
}
