import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "discord.js";
import type { Message } from "discord.js";
import type {
	ChatInputCommand,
	ContextMenuCommand,
	MessageCommand,
} from "../../../types";
import type { PreconditionContext } from "../../Precondition";
import type {
	IPreconditionContainer,
	PreconditionContainerReturn,
} from "../Container";

/** Defines the condition for {@link PreconditionContainerArray}s to run. */
export interface IPreconditionCondition {
	/** Runs the containers one by one. @seealso {@link PreconditionRunMode.Sequential} */
	messageSequential(
		message: Message,
		command: MessageCommand,
		entries: readonly IPreconditionContainer[],
		context: PreconditionContext,
	): PreconditionContainerReturn;

	/** Runs all the containers using `Promise.all`, then checks the results once all tasks finished running. @seealso {@link PreconditionRunMode.Parallel} */
	messageParallel(
		message: Message,
		command: MessageCommand,
		entries: readonly IPreconditionContainer[],
		context: PreconditionContext,
	): PreconditionContainerReturn;

	/** Runs the containers one by one. @seealso {@link PreconditionRunMode.Sequential} */
	chatInputSequential(
		interaction: ChatInputCommandInteraction,
		command: ChatInputCommand,
		entries: readonly IPreconditionContainer[],
		context: PreconditionContext,
	): PreconditionContainerReturn;

	/** Runs all the containers using `Promise.all`, then checks the results once all tasks finished running. @seealso {@link PreconditionRunMode.Parallel} */
	chatInputParallel(
		interaction: ChatInputCommandInteraction,
		command: ChatInputCommand,
		entries: readonly IPreconditionContainer[],
		context: PreconditionContext,
	): PreconditionContainerReturn;

	/** Runs the containers one by one. @seealso {@link PreconditionRunMode.Sequential} */
	contextMenuSequential(
		interaction: ContextMenuCommandInteraction,
		command: ContextMenuCommand,
		entries: readonly IPreconditionContainer[],
		context: PreconditionContext,
	): PreconditionContainerReturn;

	/** Runs all the containers using `Promise.all`, then checks the results once all tasks finished running. @seealso {@link PreconditionRunMode.Parallel} */
	contextMenuParallel(
		interaction: ContextMenuCommandInteraction,
		command: ContextMenuCommand,
		entries: readonly IPreconditionContainer[],
		context: PreconditionContext,
	): PreconditionContainerReturn;
}
