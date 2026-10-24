import type { Awaitable } from "@virello/util/general";
import type { MessageContext as Message } from "../../discord/MessageContext";
import { Args } from "../../commands/arguments/Args";
import { Command } from "../../commands/Command";
import { type MessageCommand } from "../../commands/types";

/** Message command selected by regex aliases and an optional random chance. */
export abstract class PatternCommand extends Command<
	Args,
	PatternCommand.Options
> {
	/** Optional class metadata passed as constructor options by the loader. */
	public static override readonly options?: PatternCommand.Options;
	/** Chance value used by pattern dispatch. Defaults to 100. */
	public readonly chance: number;
	/** Candidate priority. Defaults to 5; nonzero supplied values are clamped to 0..10. */
	public readonly weight: number;
	/** Wrap the command’s regex key in word boundaries when true. Alias regexes keep their original form. Defaults to false. */
	public readonly matchFullName: boolean;
	/**
	 * Create a regex-triggered command.
	 * @param context - Loader metadata and pattern command store.
	 * @param options - Command, chance, priority, and match settings.
	 */
	public constructor(
		context: PatternCommand.Context,
		options: PatternCommand.Options,
	) {
		super(context, options);
		this.chance = options.chance ?? 100;
		if (options.weight) {
			if (options.weight < 0) {
				this.weight = 0;
			} else if (options.weight > 10) {
				this.weight = 10;
			} else {
				this.weight = options.weight;
			}
		} else {
			this.weight = 5;
		}
		this.matchFullName = options.matchFullName ?? false;
	}

	/**
	 * Handle an accepted pattern match.
	 * @param message - Matched message.
	 * @returns Any result, awaited and passed to the success event.
	 */
	public abstract override messageRun(message: Message): Awaitable<unknown>;
}

/** Message command settings with pattern chance, priority, and optional word boundaries around the command-name regex. */
export interface PatternCommandOptions extends MessageCommand.Options {
	/** Threshold compared to a random integer from 1 through 100 after checks pass. Defaults to 100; values are not clamped. */
	chance?: number;
	/** The matching weight of the command.
	 * @default 5 */
	weight?: number;
	/**
	 * Add word boundaries around the command-name regex. This does not anchor the whole message and does not change alias
	 * regexes. Defaults to false.
	 */
	matchFullName?: boolean;
}

/** Types and helpers for {@link PatternCommand}. */
export declare namespace PatternCommand {
	/** Shorthand for {@link MessageCommand.Context}. */
	export type Context = MessageCommand.Context;

	/** Re-export of {@link MessageCommand.RunContext} */
	export type RunContext = MessageCommand.RunContext;

	/** Re-export of {@link MessageCommand.JSON} */
	export type JSON = MessageCommand.JSON;

	/** Re-export of {@link MessageCommand.RunInTypes} */
	export type RunInTypes = MessageCommand.RunInTypes;

	/** The PatternCommand Options */
	export type Options = PatternCommandOptions;
}
