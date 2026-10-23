/** The available command pre-conditions. */
export enum SubcommandCommandPreConditions {
	/** Registered subcommand cooldown check name. */
	SubcommandCooldown = "SubcommandCooldown",
}

/** The available subcommand pre-conditions. */
export enum SubcommandIdentifiers {
	/** Failure identifier when a subcommand cooldown bucket has no uses remaining. */
	SubcommandPreconditionCooldown = "subcommandPreconditionCooldown",
}
