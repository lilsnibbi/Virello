/** Events emitted during the parsing and command run. You can use these events for debugging and logging purposes. */
export enum PatternCommandEvents {
	/** Event that is emitted when the RNG doesn't love the command */
	CommandNoLuck = "patternCommandNoLuck",
	/** Event that is emitted when an alias triggered the command but before parsing the preconditions */
	PreCommandRun = "patternCommandPreRun",
	/** Event that is emitted after the preconditions if none of them denied the command */
	CommandAccepted = "patternCommandAccepted",
	/** Event that is emitted after the preconditions if at least one of them denied the command */
	CommandDenied = "patternCommandDenied",
	/** Event that is emitted just before the command is ran */
	CommandRun = "patternCommandRun",
	/** Event that is emitted if there's no error while running the command */
	CommandSuccess = "patternCommandSuccess",
	/** Event that is emitted if there's an error while running the command */
	CommandError = "patternCommandError",
	/** Event that is emitted if the command has finished, regardless of whether an error occurred or not */
	CommandFinished = "patternCommandFinished",
}
