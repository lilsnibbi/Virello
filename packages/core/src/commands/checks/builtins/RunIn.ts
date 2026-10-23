import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "../../../discord/InteractionContext";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import { Command } from "../../Command";
import { Identifiers } from "../../errors/Identifiers";
import type {
	ChatInputCommand,
	ContextMenuCommand,
	MessageCommand,
} from "../../types";
import { AllFlowsPrecondition, type Preconditions } from "../Precondition";

/** Allowed channel context for the RunIn check. */
export interface RunInPreconditionContext
	extends AllFlowsPrecondition.RunContext {
	/** Allowed shared or per-handler channel lists. Omit to allow every channel type. */
	types?: Preconditions["RunIn"]["types"];
}

/** Require the invocation channel type to appear in the configured list. Available through CorePreconditions. */
export class RunInCheck extends AllFlowsPrecondition {
	/**
	 * Check a message invocation. Require the invocation channel type to appear in the configured list.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public override async messageRun(
		message: Message<boolean>,
		_: MessageCommand,
		context: RunInPreconditionContext,
	): AllFlowsPrecondition.AsyncResult {
		const commandType = "message";
		if (!context.types) return this.ok();

		const channelType = (await this.fetchChannelFromMessage(message)).type;

		if (Command.runInTypeIsSpecificsObject(context.types)) {
			return context.types.messageRun.includes(channelType)
				? this.ok()
				: this.makeSharedError(context, commandType);
		}

		return context.types.includes(channelType)
			? this.ok()
			: this.makeSharedError(context, commandType);
	}

	/**
	 * Check a slash invocation. Require the invocation channel type to appear in the configured list.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public override async chatInputRun(
		interaction: ChatInputCommandInteraction,
		_: ChatInputCommand,
		context: RunInPreconditionContext,
	): AllFlowsPrecondition.AsyncResult {
		const commandType = "chat input";
		if (!context.types) return this.ok();

		const channelType = (await this.fetchChannelFromInteraction(interaction))
			.type;

		if (Command.runInTypeIsSpecificsObject(context.types)) {
			return context.types.chatInputRun.includes(channelType)
				? this.ok()
				: this.makeSharedError(context, commandType);
		}

		return context.types.includes(channelType)
			? this.ok()
			: this.makeSharedError(context, commandType);
	}

	/**
	 * Check a context-menu invocation. Require the invocation channel type to appear in the configured list.
	 * @returns Ok to allow or a precondition error to deny. Any failed Discord fetch rejects.
	 */
	public override async contextMenuRun(
		interaction: ContextMenuCommandInteraction,
		_: ContextMenuCommand,
		context: RunInPreconditionContext,
	): AllFlowsPrecondition.AsyncResult {
		const commandType = "context menu";
		if (!context.types) return this.ok();

		const channelType = (await this.fetchChannelFromInteraction(interaction))
			.type;

		if (Command.runInTypeIsSpecificsObject(context.types)) {
			return context.types.contextMenuRun.includes(channelType)
				? this.ok()
				: this.makeSharedError(context, commandType);
		}

		return context.types.includes(channelType)
			? this.ok()
			: this.makeSharedError(context, commandType);
	}

	private makeSharedError(
		context: RunInPreconditionContext,
		commandType: string,
	): AllFlowsPrecondition.Result {
		return this.error({
			identifier: Identifiers.PreconditionRunIn,
			message: `You cannot run this ${commandType} command in this type of channel.`,
			context: { types: context.types },
		});
	}
}
