import { type Command } from "../../../commands/Command";

/** A subcommand method mapping or a group of method mappings. */
export type SubcommandMapping =
	SubcommandMappingMethod | SubcommandMappingGroup;

/** Ordered list of method and group mappings. */
export type SubcommandMappingArray = SubcommandMapping[];

/** Name and optional kind shared by subcommand mappings. */
interface SubcommandMappingBase {
	/** The name of this subcommand, or subcommand group */
	name: string;
	/** Whether this subcommand mapping describes a `'method'` or `'group'`
	 * @default 'method' */
	type?: "group" | "method";
}

/** Describes how a subcommand method maps to the actual implementation of that subcommand. */
export interface SubcommandMappingMethod
	extends
		SubcommandMappingBase,
		Pick<
			Command.Options,
			| "preconditions"
			// The following are shortcuts that expand to preconditions
			| "runIn"
			| "nsfw"
			| "cooldownLimit"
			| "cooldownDelay"
			| "cooldownScope"
			| "cooldownFilteredUsers"
			| "requiredClientPermissions"
			| "requiredUserPermissions"
		> {
	/** This subcommand mapping describes a subcommand method and can therefore only ever be `'method'` */
	type?: "method";
	/** Whether this is the default subcommand when none is provided. */
	default?: boolean;
	/** The class method to call when invoking this subcommand through a **message command**, or a callback implementation of the subcommand. */
	messageRun?: string | Command["messageRun"];
	/** The class method to call when invoking this subcommand through a **chat input command**, or a callback implementation of the subcommand. */
	chatInputRun?: string | Command["chatInputRun"];
}

/** Named group of method mappings. */
export interface SubcommandMappingGroup extends SubcommandMappingBase {
	/** Marks this mapping as a group. */
	type: "group";
	/** Method mappings belonging to this group. */
	entries: SubcommandMappingMethod[];
}

// Type aliases
/** Subcommand method mapping with a required messageRun handler reference. */
export type MessageSubcommandMappingMethod = Omit<
	SubcommandMappingMethod,
	"messageRun"
> &
	Required<Pick<SubcommandMappingMethod, "messageRun">>;

/** Subcommand method mapping with a required chatInputRun handler reference. */
export type ChatInputCommandSubcommandMappingMethod = Omit<
	SubcommandMappingMethod,
	"chatInputRun"
> &
	Required<Pick<SubcommandMappingMethod, "chatInputRun">>;
