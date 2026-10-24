import type { PreconditionContext } from "../../commands/checks/Precondition";
import type { Message } from "discord.js";
import type { PatternCommand } from "./PatternCommand";

/** Data passed with the pattern command pre event. */
export interface PatternCommandPrePayload extends PreconditionContext {
	/** Message that triggered this event. */
	message: Message;
	/** Candidate pattern commands, ordered for matching. */
	possibleCommands: PossiblePatternCommand[];
}

/** Data passed with the pattern command event. */
export interface PatternCommandPayload extends PreconditionContext {
	/** Message that triggered this event. */
	message: Message;
	/** Command associated with this invocation. */
	command: PatternCommand;
	/** Matched command key, alias, or message text identifying this candidate. */
	alias: string;
}

/** Data passed with the pattern pre command run event. */
export type PatternPreCommandRunPayload = PatternCommandDeniedPayload;

/** Data passed with the pattern command denied event. */
export interface PatternCommandDeniedPayload extends PatternCommandPayload {
	/** Raw text after the command name, before argument parsing. */
	parameters: string;
	/** Invocation metadata passed to the command. */
	context: PatternCommand.RunContext;
}

/** Data passed with the pattern command accepted event. */
export interface PatternCommandAcceptedPayload extends PatternCommandPayload {
	/** Raw text after the command name, before argument parsing. */
	parameters: string;
	/** Invocation metadata passed to the command. */
	context: PatternCommand.RunContext;
}

/** Data passed with the pattern command success event. */
export interface PatternCommandSuccessPayload extends PatternCommandFinishedPayload {
	/** Value returned by the handler. */
	result: unknown;
}

/** Data passed with the pattern command finished event. */
export interface PatternCommandFinishedPayload extends PatternCommandAcceptedPayload {
	/** Elapsed execution time in milliseconds, or -1 when the attempt failed before a duration was available. */
	duration: number;
	/** Whether the command attempt completed successfully. */
	success: boolean;
}

/** Data passed with the pattern command error event. */
export type PatternCommandErrorPayload = PatternCommandFinishedPayload;

/** Data passed with the pattern command no luck event. */
export type PatternCommandNoLuckPayload = PatternCommandAcceptedPayload;

/** One pattern-command candidate with its alias and ordering weight. */
export interface PossiblePatternCommand {
	/** Pattern command candidate. */
	command: PatternCommand;
	/** Regex source registered for this candidate. */
	alias: string;
	/** Candidate ordering weight used during pattern matching. */
	weight: number;
}
