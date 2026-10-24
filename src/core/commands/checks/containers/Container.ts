import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "discord.js";
import type { Message } from "discord.js";
import type { Awaitable } from "../../../../util/general";
import type { Result } from "../../../../util/result/index";
import type { Command } from "../../Command";
import type { UserError } from "../../errors/UserError";
import type { PreconditionContext } from "../Precondition";

/** Defines the result's value for a PreconditionContainer. */
export type PreconditionContainerResult = Result<unknown, UserError>;

/** Defines the return type of the generic {@link IPreconditionContainer.messageRun}. */
export type PreconditionContainerReturn =
	Awaitable<PreconditionContainerResult>;

/** Async-only version of {@link PreconditionContainerReturn}, to be used when the run method is async. */
export type AsyncPreconditionContainerReturn =
	Promise<PreconditionContainerResult>;

/** An abstracted precondition container to be implemented by classes. */
export interface IPreconditionContainer {
	/** Runs a precondition container. */
	messageRun(
		message: Message,
		command: Command,
		context?: PreconditionContext,
	): PreconditionContainerReturn;
	/** Runs a precondition container. */
	chatInputRun(
		interaction: ChatInputCommandInteraction,
		command: Command,
		context?: PreconditionContext,
	): PreconditionContainerReturn;
	/** Runs a precondition container. */
	contextMenuRun(
		interaction: ContextMenuCommandInteraction,
		command: Command,
		context?: PreconditionContext,
	): PreconditionContainerReturn;
}
