import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "../../../discord/InteractionContext";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import { Identifiers } from "../../errors/Identifiers";
import { AllFlowsPrecondition } from "../Precondition";

/**
 * Require a guild invocation. Available through CorePreconditions.
 * @deprecated Use the RunIn check with explicit channel types.
 */
export class GuildOnlyCheck extends AllFlowsPrecondition {
	/**
	 * Check a message invocation. Require a guild invocation.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public messageRun(message: Message): AllFlowsPrecondition.Result {
		return message.guildId === null ? this.makeSharedError() : this.ok();
	}

	/**
	 * Check a slash invocation. Require a guild invocation.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public chatInputRun(
		interaction: ChatInputCommandInteraction,
	): AllFlowsPrecondition.Result {
		return interaction.guildId === null ? this.makeSharedError() : this.ok();
	}

	/**
	 * Check a context-menu invocation. Require a guild invocation.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public contextMenuRun(
		interaction: ContextMenuCommandInteraction,
	): AllFlowsPrecondition.Result {
		return interaction.guildId === null ? this.makeSharedError() : this.ok();
	}

	private makeSharedError(): AllFlowsPrecondition.Result {
		return this.error({
			identifier: Identifiers.PreconditionGuildOnly,
			message: "You cannot run this command in DMs.",
		});
	}
}
