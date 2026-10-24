import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "../../../discord/InteractionContext";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import { Identifiers } from "../../errors/Identifiers";
import { AllFlowsPrecondition } from "../Precondition";

/**
 * Require a direct-message invocation. Available through CorePreconditions.
 * @deprecated Use the RunIn check with explicit channel types.
 */
export class DMOnlyCheck extends AllFlowsPrecondition {
	/**
	 * Check a message invocation. Require a direct-message invocation.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public messageRun(message: Message): AllFlowsPrecondition.Result {
		return message.guild === null ? this.ok() : this.makeSharedError();
	}

	/**
	 * Check a slash invocation. Require a direct-message invocation.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public chatInputRun(
		interaction: ChatInputCommandInteraction,
	): AllFlowsPrecondition.Result {
		return interaction.guildId === null ? this.ok() : this.makeSharedError();
	}

	/**
	 * Check a context-menu invocation. Require a direct-message invocation.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public contextMenuRun(
		interaction: ContextMenuCommandInteraction,
	): AllFlowsPrecondition.Result {
		return interaction.guildId === null ? this.ok() : this.makeSharedError();
	}

	private makeSharedError(): AllFlowsPrecondition.Result {
		return this.error({
			identifier: Identifiers.PreconditionDMOnly,
			message: "You cannot run this command outside DMs.",
		});
	}
}
