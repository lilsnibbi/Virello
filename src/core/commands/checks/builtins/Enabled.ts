import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "discord.js";
import type { Message } from "discord.js";
import type { Command } from "../../Command";
import { Identifiers } from "../../errors/Identifiers";
import { AllFlowsPrecondition } from "../Precondition";

/** Require command.enabled to be true. Available through CorePreconditions. */
export class EnabledCheck extends AllFlowsPrecondition {
	/**
	 * Create the enabled check at global position 10.
	 * @param context - Loader metadata and precondition store.
	 */
	public constructor(context: AllFlowsPrecondition.Context) {
		super(context, { position: 10 });
	}

	/**
	 * Check a message invocation. Require command.enabled to be true.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public messageRun(
		_: Message,
		command: Command,
		context: AllFlowsPrecondition.RunContext,
	): AllFlowsPrecondition.Result {
		return command.enabled
			? this.ok()
			: this.error({
					identifier: Identifiers.CommandDisabled,
					message: "This message command is disabled.",
					context,
				});
	}

	/**
	 * Check a slash invocation. Require command.enabled to be true.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public chatInputRun(
		_: ChatInputCommandInteraction,
		command: Command,
		context: AllFlowsPrecondition.RunContext,
	): AllFlowsPrecondition.Result {
		return command.enabled
			? this.ok()
			: this.error({
					identifier: Identifiers.CommandDisabled,
					message: "This chat input command is disabled.",
					context,
				});
	}

	/**
	 * Check a context-menu invocation. Require command.enabled to be true.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public contextMenuRun(
		_: ContextMenuCommandInteraction,
		command: Command,
		context: AllFlowsPrecondition.RunContext,
	): AllFlowsPrecondition.Result {
		return command.enabled
			? this.ok()
			: this.error({
					identifier: Identifiers.CommandDisabled,
					message: "This context menu command is disabled.",
					context,
				});
	}
}
