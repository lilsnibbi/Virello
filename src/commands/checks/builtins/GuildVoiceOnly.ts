import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "../../../discord/InteractionContext";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import { isVoiceChannel } from "../../../utilities/discord/index";
import { Identifiers } from "../../errors/Identifiers";
import { AllFlowsPrecondition } from "../Precondition";

/**
 * Require a guild voice channel. Available through CorePreconditions.
 * @deprecated Use the RunIn check with explicit channel types.
 */
export class GuildVoiceOnlyCheck extends AllFlowsPrecondition {
	/**
	 * Check a message invocation. Require a guild voice channel.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public async messageRun(message: Message): AllFlowsPrecondition.AsyncResult {
		return isVoiceChannel(await this.fetchChannelFromMessage(message))
			? this.ok()
			: this.makeSharedError();
	}

	/**
	 * Check a slash invocation. Require a guild voice channel.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public async chatInputRun(
		interaction: ChatInputCommandInteraction,
	): AllFlowsPrecondition.AsyncResult {
		const channel = await this.fetchChannelFromInteraction(interaction);
		return isVoiceChannel(channel) ? this.ok() : this.makeSharedError();
	}

	/**
	 * Check a context-menu invocation. Require a guild voice channel.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public async contextMenuRun(
		interaction: ContextMenuCommandInteraction,
	): AllFlowsPrecondition.AsyncResult {
		const channel = await this.fetchChannelFromInteraction(interaction);
		return isVoiceChannel(channel) ? this.ok() : this.makeSharedError();
	}

	private makeSharedError(): AllFlowsPrecondition.Result {
		return this.error({
			identifier: Identifiers.PreconditionGuildVoiceOnly,
			message: "You can only run this command in server voice channels.",
		});
	}
}
