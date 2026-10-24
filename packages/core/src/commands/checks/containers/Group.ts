import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "../../../discord/InteractionContext";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import type {
	ChatInputCommand,
	ContextMenuCommand,
	MessageCommand,
} from "../../types";
import type {
	PreconditionContext,
	PreconditionKeys,
	SimplePreconditionKeys,
} from "../Precondition";
import type {
	IPreconditionContainer,
	PreconditionContainerReturn,
} from "./Container";
import { PreconditionConditionAnd } from "./conditions/all";
import { PreconditionConditionOr } from "./conditions/any";
import type { IPreconditionCondition } from "./conditions/Condition";
import {
	PreconditionContainerSingle,
	type PreconditionSingleResolvable,
	type PreconditionSingleResolvableDetails,
	type SimplePreconditionSingleResolvableDetails,
} from "./Entry";

/** The run mode for a {@link PreconditionContainerArray}. */
export enum PreconditionRunMode {
	/** The entries are run sequentially, this is the default behaviour and can be slow when doing long asynchronous tasks, but is performance savvy. */
	Sequential,

	/** All entries are run in parallel using `Promise.all`, then the results are processed after all of them have completed. */
	Parallel,
}

/** The condition for a {@link PreconditionContainerArray}. */
export enum PreconditionRunCondition {
	/** Defines a condition where all the entries must pass. This uses {@link PreconditionConditionAnd}. */
	And,

	/** Defines a condition where at least one entry must pass. This uses {@link PreconditionConditionOr}. */
	Or,
}

/** Defines the detailed options for the {@link PreconditionContainerArray}, where both the {@link PreconditionRunMode} and the entries can be defined. */
export interface PreconditionArrayResolvableDetails {
	/** The data that will be used to resolve {@link IPreconditionContainer} dependent of this one. */
	entries: readonly PreconditionEntryResolvable[];

	/** The mode the {@link PreconditionContainerArray} will run. */
	mode: PreconditionRunMode;
}

/** Defines the data accepted by {@link PreconditionContainerArray}'s constructor. */
export type PreconditionArrayResolvable =
	readonly PreconditionEntryResolvable[] | PreconditionArrayResolvableDetails;

/** Defines the data accepted for each entry of the array. */
export type PreconditionEntryResolvable =
	PreconditionSingleResolvable | PreconditionArrayResolvable;

function isSingle(
	entry: PreconditionEntryResolvable,
): entry is PreconditionSingleResolvable {
	return typeof entry === "string" || Reflect.has(entry, "name");
}

/** An {@link IPreconditionContainer} that defines an array of multiple {@link IPreconditionContainer}s. */
export class PreconditionContainerArray implements IPreconditionContainer {
	/** The mode at which this precondition will run. */
	public readonly mode: PreconditionRunMode;

	/** The {@link IPreconditionContainer}s the array holds. */
	public readonly entries: IPreconditionContainer[];

	/** The {@link PreconditionRunCondition} that defines how entries must be handled. */
	public readonly runCondition: PreconditionRunCondition;

	/**
	 * Create a group of checks. Nested groups alternate AND and OR; plain arrays inherit their parent’s run mode.
	 * @param data - Entries, or entries with an explicit mode. Defaults to an empty sequential AND group.
	 * @param parent - Optional parent used to select the opposite condition and inherited mode.
	 */
	public constructor(
		data: PreconditionArrayResolvable = [],
		parent: PreconditionContainerArray | null = null,
	) {
		this.entries = [];
		this.runCondition =
			parent?.runCondition === PreconditionRunCondition.And
				? PreconditionRunCondition.Or
				: PreconditionRunCondition.And;

		if (Array.isArray(data)) {
			const casted = data as readonly PreconditionEntryResolvable[];

			this.mode = parent?.mode ?? PreconditionRunMode.Sequential;
			this.parse(casted);
		} else {
			const casted = data as PreconditionArrayResolvableDetails;

			this.mode = casted.mode;
			this.parse(casted.entries);
		}
	}

	/** Adds a new entry to the array. */
	public add(entry: IPreconditionContainer): this {
		this.entries.push(entry);
		return this;
	}

	/**
	 * Append a named check, contextful entry, or existing group.
	 * @param entry - Entry to append.
	 * @returns This group.
	 */
	public append(
		keyOrEntries:
			| SimplePreconditionSingleResolvableDetails
			| SimplePreconditionKeys
			| PreconditionContainerArray,
	): this;
	/**
	 * Append a named check, contextful entry, or existing group.
	 * @param entry - Entry to append.
	 * @returns This group.
	 */
	public append<K extends PreconditionKeys>(
		entry: PreconditionSingleResolvableDetails<K>,
	): this;
	/**
	 * Append a named check, contextful entry, or existing group.
	 * @param entry - Entry to append.
	 * @returns This group.
	 */
	public append(
		entry: PreconditionContainerArray | PreconditionSingleResolvable,
	): this {
		this.entries.push(
			entry instanceof PreconditionContainerArray
				? entry
				: new PreconditionContainerSingle(entry),
		);
		return this;
	}

	/** Runs the container. */
	public messageRun(
		message: Message,
		command: MessageCommand,
		context: PreconditionContext = {},
	): PreconditionContainerReturn {
		return this.mode === PreconditionRunMode.Sequential
			? this.condition.messageSequential(
					message,
					command,
					this.entries,
					context,
				)
			: this.condition.messageParallel(message, command, this.entries, context);
	}

	/** Runs the container. */
	public chatInputRun(
		interaction: ChatInputCommandInteraction,
		command: ChatInputCommand,
		context: PreconditionContext = {},
	): PreconditionContainerReturn {
		return this.mode === PreconditionRunMode.Sequential
			? this.condition.chatInputSequential(
					interaction,
					command,
					this.entries,
					context,
				)
			: this.condition.chatInputParallel(
					interaction,
					command,
					this.entries,
					context,
				);
	}

	/** Runs the container. */
	public contextMenuRun(
		interaction: ContextMenuCommandInteraction,
		command: ContextMenuCommand,
		context: PreconditionContext = {},
	): PreconditionContainerReturn {
		return this.mode === PreconditionRunMode.Sequential
			? this.condition.contextMenuSequential(
					interaction,
					command,
					this.entries,
					context,
				)
			: this.condition.contextMenuParallel(
					interaction,
					command,
					this.entries,
					context,
				);
	}

	/** Parse the precondition entry resolvables, and adds them to the entries. */
	protected parse(entries: Iterable<PreconditionEntryResolvable>): this {
		for (const entry of entries) {
			this.add(
				isSingle(entry) //
					? new PreconditionContainerSingle(entry)
					: new PreconditionContainerArray(entry, this),
			);
		}

		return this;
	}

	/** Get a condition from {@link PreconditionContainerArray.conditions}, assuming existence. */
	protected get condition(): IPreconditionCondition {
		return PreconditionContainerArray.conditions.get(this.runCondition)!;
	}

	/** The preconditions to be run. Extra ones can be added by augmenting {@link PreconditionRunCondition} and then inserting {@link IPreconditionCondition}s. */
	public static readonly conditions = new Map<
		PreconditionRunCondition,
		IPreconditionCondition
	>([
		[PreconditionRunCondition.And, PreconditionConditionAnd],
		[PreconditionRunCondition.Or, PreconditionConditionOr],
	]);
}
