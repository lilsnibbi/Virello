import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "../../../discord/InteractionContext";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import { container } from "../../../core/modules/index";
import { err } from "../../../utilities/result/index";
import { Identifiers } from "../../errors/Identifiers";
import { UserError } from "../../errors/UserError";
import type {
	ChatInputCommand,
	ContextMenuCommand,
	MessageCommand,
} from "../../types";
import type {
	PreconditionContext,
	PreconditionKeys,
	Preconditions,
	SimplePreconditionKeys,
} from "../Precondition";
import type { IPreconditionContainer } from "./Container";

/** Defines the simple options for the {@link PreconditionContainerSingle}, where only the name of the precondition can be defined. */
export interface SimplePreconditionSingleResolvableDetails {
	/** The name of the precondition to retrieve from {@link VirelloClient.preconditions}. */
	name: SimplePreconditionKeys;
}

/** Defines the detailed options for the {@link PreconditionContainerSingle}, where both the {@link PreconditionContext} and the name of the precondition can be defined. */
export interface PreconditionSingleResolvableDetails<
	K extends PreconditionKeys = PreconditionKeys,
> {
	/** The name of the precondition to retrieve from {@link VirelloClient.preconditions}. */
	name: K;

	/** The context to be set at {@link PreconditionContainerSingle.context}. */
	context: Preconditions[K];
}

/** Defines the data accepted by {@link PreconditionContainerSingle}'s constructor. */
export type PreconditionSingleResolvable =
	| SimplePreconditionKeys
	| SimplePreconditionSingleResolvableDetails
	| PreconditionSingleResolvableDetails;

/** An {@link IPreconditionContainer} which runs a single precondition from {@link VirelloClient.preconditions}. */
export class PreconditionContainerSingle implements IPreconditionContainer {
	/** Context passed to the precondition. String entries get an empty object. */
	public readonly context: Record<PropertyKey, unknown>;

	/** The name of the precondition to run. */
	public readonly name: string;

	/**
	 * Create a named check entry with optional stored context.
	 * @param data - Check name or name/context pair. Stored context overrides invocation context at execution.
	 */
	public constructor(data: PreconditionSingleResolvable) {
		if (typeof data === "string") {
			this.context = {};
			this.name = data;
		} else {
			this.context = Reflect.get(data, "context") ?? {};
			this.name = data.name;
		}
	}

	/** Runs the container. */
	public messageRun(
		message: Message,
		command: MessageCommand,
		context: PreconditionContext = {},
	) {
		const precondition = container.modules
			.require("preconditions")
			.get(this.name);
		if (precondition) {
			return precondition.messageRun
				? precondition.messageRun(message, command, {
						...context,
						...this.context,
					})
				: precondition.error({
						identifier: Identifiers.PreconditionMissingMessageHandler,
						message: `The precondition "${precondition.name}" is missing a "messageRun" handler, but it was requested for the "${command.name}" command.`,
					});
		}
		return err(
			new UserError({
				identifier: Identifiers.PreconditionUnavailable,
				message: `The precondition "${this.name}" is not available.`,
			}),
		);
	}

	/** Runs the container. */
	public chatInputRun(
		interaction: ChatInputCommandInteraction,
		command: ChatInputCommand,
		context: PreconditionContext = {},
	) {
		const precondition = container.modules
			.require("preconditions")
			.get(this.name);
		if (precondition) {
			return precondition.chatInputRun
				? precondition.chatInputRun(interaction, command, {
						...context,
						...this.context,
					})
				: precondition.error({
						identifier: Identifiers.PreconditionMissingChatInputHandler,
						message: `The precondition "${precondition.name}" is missing a "chatInputRun" handler, but it was requested for the "${command.name}" command.`,
					});
		}
		return err(
			new UserError({
				identifier: Identifiers.PreconditionUnavailable,
				message: `The precondition "${this.name}" is not available.`,
			}),
		);
	}

	/** Runs the container. */
	public contextMenuRun(
		interaction: ContextMenuCommandInteraction,
		command: ContextMenuCommand,
		context: PreconditionContext = {},
	) {
		const precondition = container.modules
			.require("preconditions")
			.get(this.name);
		if (precondition) {
			return precondition.contextMenuRun
				? precondition.contextMenuRun(interaction, command, {
						...context,
						...this.context,
					})
				: precondition.error({
						identifier: Identifiers.PreconditionMissingContextMenuHandler,
						message: `The precondition "${precondition.name}" is missing a "contextMenuRun" handler, but it was requested for the "${command.name}" command.`,
					});
		}
		return err(
			new UserError({
				identifier: Identifiers.PreconditionUnavailable,
				message: `The precondition "${this.name}" is not available.`,
			}),
		);
	}
}
