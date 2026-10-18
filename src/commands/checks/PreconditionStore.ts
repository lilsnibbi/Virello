import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "../../discord/InteractionContext";
import type { MessageContext as Message } from "../../discord/MessageContext";
import { ModuleStore } from "../../core/modules/index";
import { Result } from "../../utilities/result/index";
import { Identifiers } from "../errors/Identifiers";
import type {
	ChatInputCommand,
	ContextMenuCommand,
	MessageCommand,
} from "../types";
import { type AsyncPreconditionResult, Precondition } from "./Precondition";

/** Store of check modules, including a global list ordered by position. */
export class PreconditionStore extends ModuleStore<
	Precondition,
	"preconditions"
> {
	private readonly globalPreconditions: Precondition[] = [];

	/** Create an empty preconditions store. */
	public constructor() {
		super(Precondition, { name: "preconditions" });
	}

	/**
	 * Run global checks for a message invocation in position order, stopping at the first Err.
	 * @param message - Triggering message.
	 * @param command - Command being checked.
	 * @param context - Shared invocation data; defaults to an empty object.
	 * @returns Ok if all checks allow, or the first denial. Missing flow handlers return an error; thrown checks reject.
	 */
	public async messageRun(
		message: Message,
		command: MessageCommand,
		context: Precondition.RunContext = {},
	): AsyncPreconditionResult {
		for (const precondition of this.globalPreconditions) {
			const result = precondition.messageRun
				? await precondition.messageRun(message, command, context)
				: await precondition.error({
						identifier: Identifiers.PreconditionMissingMessageHandler,
						message: `The precondition "${precondition.name}" is missing a "messageRun" handler, but it was requested for the "${command.name}" command.`,
					});

			if (result.isErr()) {
				return result;
			}
		}

		return Result.ok();
	}

	/**
	 * Run global checks for a slash invocation in position order, stopping at the first Err.
	 * @param interaction - Triggering interaction.
	 * @param command - Command being checked.
	 * @param context - Shared invocation data; defaults to an empty object.
	 * @returns Ok if all checks allow, or the first denial. Missing flow handlers return an error; thrown checks reject.
	 */
	public async chatInputRun(
		interaction: ChatInputCommandInteraction,
		command: ChatInputCommand,
		context: Precondition.RunContext = {},
	): AsyncPreconditionResult {
		for (const precondition of this.globalPreconditions) {
			const result = precondition.chatInputRun
				? await precondition.chatInputRun(interaction, command, context)
				: await precondition.error({
						identifier: Identifiers.PreconditionMissingChatInputHandler,
						message: `The precondition "${precondition.name}" is missing a "chatInputRun" handler, but it was requested for the "${command.name}" command.`,
					});

			if (result.isErr()) {
				return result;
			}
		}

		return Result.ok();
	}

	/**
	 * Run global checks for a context-menu invocation in position order, stopping at the first Err.
	 * @param interaction - Triggering interaction.
	 * @param command - Command being checked.
	 * @param context - Shared invocation data; defaults to an empty object.
	 * @returns Ok if all checks allow, or the first denial. Missing flow handlers return an error; thrown checks reject.
	 */
	public async contextMenuRun(
		interaction: ContextMenuCommandInteraction,
		command: ContextMenuCommand,
		context: Precondition.RunContext = {},
	): AsyncPreconditionResult {
		for (const precondition of this.globalPreconditions) {
			const result = precondition.contextMenuRun
				? await precondition.contextMenuRun(interaction, command, context)
				: await precondition.error({
						identifier: Identifiers.PreconditionMissingContextMenuHandler,
						message: `The precondition "${precondition.name}" is missing a "contextMenuRun" handler, but it was requested for the "${command.name}" command.`,
					});

			if (result.isErr()) {
				return result;
			}
		}

		return Result.ok();
	}

	/**
	 * Store a check and add it to the global list when position is non-null. Equal positions put the new entry first.
	 * @param key - Lookup name.
	 * @param value - Check module.
	 * @returns This store. Prefer insert() when lifecycle hooks must run.
	 */
	public override set(key: string, value: Precondition): this {
		if (value.position !== null) {
			const index = this.globalPreconditions.findIndex(
				(precondition) => precondition.position! >= value.position!,
			);

			// If a precondition with lower priority wasn't found, push to the end of the array
			if (index === -1) this.globalPreconditions.push(value);
			else this.globalPreconditions.splice(index, 0, value);
		}

		return super.set(key, value);
	}

	/**
	 * Remove the named check from lookup and the global list.
	 * @param key - Lookup name.
	 * @returns Whether the lookup entry existed. Use unload() to run cleanup.
	 */
	public override delete(key: string): boolean {
		const index = this.globalPreconditions.findIndex(
			(precondition) => precondition.name === key,
		);

		// If the precondition was found, remove it
		if (index !== -1) this.globalPreconditions.splice(index, 1);

		return super.delete(key);
	}

	/** Clear lookup entries and the global check list. Use unloadAll() to run cleanup. */
	public override clear(): void {
		this.globalPreconditions.length = 0;
		super.clear();
	}
}
