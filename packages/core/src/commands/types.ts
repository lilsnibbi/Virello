import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "../discord/InteractionContext";
import type { PermissionInput as PermissionResolvable } from "../discord/permissions";
import { ChannelType, type Snowflake } from "discord-api-types/v10";
import { AliasModule, type AliasModuleJSON } from "../core/modules/index";
import type { Nullish } from "@virello/util/general";
import { type FlagStrategyOptions } from "@virello/util/parsing/flags";
import type { Command } from "./Command";
import { type PreconditionEntryResolvable } from "./checks/containers/Group";
import { BucketScope, CommandOptionsRunTypeEnum } from "./enums";
import type { ApplicationCommandRegistry } from "./registration/Registry";

/** Detailed help text, or a custom description object interpreted by your application. */
export type DetailedDescriptionCommand =
	string | DetailedDescriptionCommandObject;

/** Augmentable shape for application-specific command help data. Virello stores it without interpreting its fields. */
export interface DetailedDescriptionCommandObject {}

/** The allowed values for {@link CommandOptions.runIn}. */
export type CommandOptionsRunType =
	| "DM"
	| "GUILD_TEXT"
	| "GUILD_VOICE"
	| "GUILD_NEWS"
	| "GUILD_NEWS_THREAD"
	| "GUILD_PUBLIC_THREAD"
	| "GUILD_PRIVATE_THREAD"
	| "GUILD_ANY";

/** The allowed values for {@link CommandOptions.runIn}. */
export type CommandRunInUnion =
	| ChannelType
	| Command.RunInTypes
	| CommandOptionsRunTypeEnum
	| readonly (ChannelType | Command.RunInTypes | CommandOptionsRunTypeEnum)[]
	| Nullish;

/** A more detailed structure for {@link CommandOptions.runIn} when you want to have a different `runIn` for each command type. */
export interface CommandSpecificRunIn {
	/** Channel types allowed for slash commands. Omit to leave this flow unrestricted. */
	chatInputRun?: CommandRunInUnion;
	/** Channel types allowed for message commands. Omit to leave this flow unrestricted. */
	messageRun?: CommandRunInUnion;
	/** Channel types allowed for context-menu commands. Omit to leave this flow unrestricted. */
	contextMenuRun?: CommandRunInUnion;
}

/** The {@link Command} options. */
export interface CommandOptions
	extends AliasModule.Options, FlagStrategyOptions {
	/** Whether to add aliases for commands with dashes in them
	 * @default false */
	generateDashLessAliases?: boolean;

	/** Whether to add aliases for commands with underscores in them
	 * @default false */
	generateUnderscoreLessAliases?: boolean;

	/** The description for the command.
	 * @default '' */
	description?: string;

	/** The detailed description for the command.
	 * @default '' */
	detailedDescription?: DetailedDescriptionCommand;

	/** Category folder names. Defaults to the module’s directories relative to its configured root. */
	fullCategory?: string[];

	/** Command checks as names, named entries with context, or nested groups. Defaults to an empty list. */
	preconditions?: readonly PreconditionEntryResolvable[];

	/**
	 * Opening/closing quote pairs accepted by message argument parsing. Defaults to straight double quotes, curly double
	 * quotes, CJK corner brackets, and guillemets. Pass [] to disable quoting.
	 */
	quotes?: [string, string][];

	/** Set whether the command should be treated as NSFW. If set to true, the `NSFW` precondition will be added to the list.
	 * @default false */
	nsfw?: boolean;

	/** Uses per cooldown bucket. Defaults to client.defaultCooldown.limit or 1. A positive limit and delay enable the cooldown check. */
	cooldownLimit?: number;

	/** Bucket reset time in milliseconds. Defaults to client.defaultCooldown.delay or 0, which disables the cooldown check. */
	cooldownDelay?: number;

	/** Bucket key scope. Defaults to client.defaultCooldown.scope or BucketScope.User. */
	cooldownScope?: BucketScope;

	/** Users exempt from this command’s cooldown. Defaults to client.defaultCooldown.filteredUsers or an empty list. */
	cooldownFilteredUsers?: Snowflake[];

	/** The required permissions for the client.
	 * @default 0 */
	requiredClientPermissions?: PermissionResolvable;

	/** The required permissions for the user.
	 * @default 0 */
	requiredUserPermissions?: PermissionResolvable;

	/** The channels the command should run in.
	 * @default null */
	runIn?: CommandRunInUnion | CommandSpecificRunIn;

	/** Send typing while this message command runs when client.options.typing is enabled. Defaults to true. */
	typing?: boolean;
}

/** Matched prefix and command name for one message-command invocation. Extra fields may be added by your application. */
export interface MessageCommandContext extends Record<PropertyKey, unknown> {
	/** The prefix used to run this command.  This is a string for the mention and default prefix, and a RegExp for the `regexPrefix`. */
	prefix: string | RegExp;
	/** The alias used to run this command. */
	commandName: string;
	/** Exact prefix text matched in the message, including a regex prefix match. */
	commandPrefix: string;
}

/** Slash command name and Discord ID for one invocation. */
export interface ChatInputCommandContext extends Record<PropertyKey, unknown> {
	/** The name of the command. */
	commandName: string;
	/** The id of the command. */
	commandId: string;
}

/** Context-menu command name and Discord ID for one invocation. */
export interface ContextMenuCommandContext extends Record<
	PropertyKey,
	unknown
> {
	/** The name of the command. */
	commandName: string;
	/** The id of the command. */
	commandId: string;
}

/** Command name and Discord ID for an autocomplete request. */
export interface AutocompleteCommandContext extends Record<
	PropertyKey,
	unknown
> {
	/** The name of the command. */
	commandName: string;
	/** The id of the command. */
	commandId: string;
}

/** Command metadata returned by toJSON. */
export interface CommandJSON extends AliasModuleJSON {
	/** Short command description. */
	description: string;
	/** Detailed help text or custom help object. */
	detailedDescription: DetailedDescriptionCommand;
	/** First category folder, or null if none exists. */
	category: string | null;
}

/** Command with an autocompleteRun handler. */
export type AutocompleteCommand = Command &
	Required<Pick<Command, "autocompleteRun">>;

/** Types and helpers for {@link AutocompleteCommand}. */
export declare namespace AutocompleteCommand {
	/** Shorthand for {@link Command.Options}. */
	export type Options = Command.Options;
	/** Shorthand for {@link Command.JSON}. */
	export type JSON = Command.JSON;
	/** Shorthand for {@link Command.Context}. */
	export type Context = Command.Context;
	/** Shorthand for {@link CommandOptionsRunType}. */
	export type RunInTypes = CommandOptionsRunType;
	/** Shorthand for {@link AutocompleteCommandContext}. */
	export type RunContext = AutocompleteCommandContext;
	/** Shorthand for {@link AutocompleteInteraction}. */
	export type Interaction = AutocompleteInteraction;
	/** Shorthand for {@link ApplicationCommandRegistry}. */
	export type Registry = ApplicationCommandRegistry;
}

/** Command with a contextMenuRun handler. */
export type ContextMenuCommand = Command &
	Required<Pick<Command, "contextMenuRun">>;

/** Types and helpers for {@link ContextMenuCommand}. */
export declare namespace ContextMenuCommand {
	/** Shorthand for {@link Command.Options}. */
	export type Options = Command.Options;
	/** Shorthand for {@link Command.JSON}. */
	export type JSON = Command.JSON;
	/** Shorthand for {@link Command.Context}. */
	export type Context = Command.Context;
	/** Shorthand for {@link CommandOptionsRunType}. */
	export type RunInTypes = CommandOptionsRunType;
	/** Shorthand for {@link ContextMenuCommandContext}. */
	export type RunContext = ContextMenuCommandContext;
	/** Shorthand for {@link ContextMenuCommandInteraction}. */
	export type Interaction = ContextMenuCommandInteraction;
	/** Shorthand for {@link ApplicationCommandRegistry}. */
	export type Registry = ApplicationCommandRegistry;
}

/** Command with a messageRun handler. */
export type MessageCommand = Command & Required<Pick<Command, "messageRun">>;

/** Types and helpers for {@link MessageCommand}. */
export declare namespace MessageCommand {
	/** Shorthand for {@link Command.Options}. */
	export type Options = Command.Options;
	/** Shorthand for {@link Command.JSON}. */
	export type JSON = Command.JSON;
	/** Shorthand for {@link Command.Context}. */
	export type Context = Command.Context;
	/** Shorthand for {@link CommandOptionsRunType}. */
	export type RunInTypes = CommandOptionsRunType;
	/** Shorthand for {@link MessageCommandContext}. */
	export type RunContext = MessageCommandContext;
}

/** Command with a chatInputRun handler. */
export type ChatInputCommand = Command &
	Required<Pick<Command, "chatInputRun">>;

/** Types and helpers for {@link ChatInputCommand}. */
export declare namespace ChatInputCommand {
	/** Shorthand for {@link Command.Options}. */
	export type Options = Command.Options;
	/** Shorthand for {@link Command.JSON}. */
	export type JSON = Command.JSON;
	/** Shorthand for {@link Command.Context}. */
	export type Context = Command.Context;
	/** Shorthand for {@link CommandOptionsRunType}. */
	export type RunInTypes = CommandOptionsRunType;
	/** Shorthand for {@link ChatInputCommandContext}. */
	export type RunContext = ChatInputCommandContext;
	/** Shorthand for {@link ChatInputCommandInteraction}. */
	export type Interaction = ChatInputCommandInteraction;
	/** Shorthand for {@link ApplicationCommandRegistry}. */
	export type Registry = ApplicationCommandRegistry;
}
