import type { Client } from "discord.js";
import type { VirelloClient } from "../core/client/VirelloClient";
import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
	BaseInteraction as Interaction,
} from "discord.js";
import type { Message } from "discord.js";
import type { Snowflake } from "discord-api-types/v10";
import type { ApplicationCommand } from "discord.js";
import {
	Events as GatewayEvents,
	type ClientEvents as DiscordEvents,
} from "discord.js";
import type { PreconditionContext } from "../commands/checks/Precondition";
import type { Command } from "../commands/Command";
import type { UserError } from "../commands/errors/UserError";
import type { ApplicationCommandRegistry } from "../commands/registration/Registry";
import type {
	AutocompleteCommand,
	AutocompleteCommandContext,
	ChatInputCommand,
	ChatInputCommandContext,
	ContextMenuCommand,
	ContextMenuCommandContext,
	MessageCommand,
} from "../commands/types";
import type { Module, ModuleStore } from "../core/modules/index";
import type { Option } from "../../util/result/index";
import type { InteractionHandler } from "./interactions/interactionHandler";
import type { Listener } from "./listener";

/** Discord and Virello event names. ClientEvents supplies each event’s argument tuple. */
export const Events = {
	...GatewayEvents,
	/** Framework client is ready; receives the active VirelloClient. */
	ClientReady: "clientReady" as const,
	/** Raw dispatch emitted by discord.js; see its event ordering contract. */
	Raw: "raw" as const,
	Error: "error" as const,
	ShardReady: "shardReady" as const,
	Shutdown: "shutdown" as const,

	// #region Virello events
	// Message commands chain
	/** A non-bot message enters prefix parsing. */
	PreMessageParsed: "preMessageParsed" as const,
	/** A message contains only the bot mention prefix. */
	MentionPrefixOnly: "mentionPrefixOnly" as const,
	/** No configured or mention prefix matched the message. */
	NonPrefixedMessage: "nonPrefixedMessage" as const,
	/** A message prefix matched, before command-name parsing. */
	PrefixedMessage: "prefixedMessage" as const,

	/** No command name followed the matched prefix. */
	UnknownMessageCommandName: "unknownMessageCommandName" as const,
	/** The parsed message command name was not found. */
	UnknownMessageCommand: "unknownMessageCommand" as const,
	/** A matched command has no messageRun handler. */
	CommandDoesNotHaveMessageCommandHandler:
		"commandDoesNotHaveMessageCommandHandler" as const,
	/** A message command is ready for precondition checks. */
	PreMessageCommandRun: "preMessageCommandRun" as const,

	/** Message command preconditions returned a denial. */
	MessageCommandDenied: "messageCommandDenied" as const,
	/** Message command preconditions passed; argument preparation and execution follow. */
	MessageCommandAccepted: "messageCommandAccepted" as const,

	/** A prepared message command is about to run. */
	MessageCommandRun: "messageCommandRun" as const,
	/** A message command resolved successfully; the payload includes its result and duration. */
	MessageCommandSuccess: "messageCommandSuccess" as const,
	/** The message-command run phase threw or rejected. Argument preparation failures are reported through ListenerError. */
	MessageCommandError: "messageCommandError" as const,
	/** A message command attempt finished, with success state and duration. */
	MessageCommandFinish: "messageCommandFinish" as const,

	/** Sending the message command’s typing indicator failed. */
	MessageCommandTypingError: "messageCommandTypingError" as const,

	// Listener errors
	/** A listener’s run method threw or rejected. */
	ListenerError: "listenerError" as const,

	// Registry errors
	/** A command’s application-registration hook failed. */
	CommandApplicationCommandRegistryError:
		"commandApplicationCommandRegistryError" as const,

	/** Application command registration is starting. */
	ApplicationCommandRegistriesInitialising:
		"applicationCommandRegistriesInitialising" as const,

	/** The registration pass completed, with the registry map and elapsed milliseconds. */
	ApplicationCommandRegistriesRegistered:
		"applicationCommandRegistriesRegistered" as const,

	/** One global or guild command list was replaced; a null guild ID means global. */
	ApplicationCommandRegistriesBulkOverwrite:
		"applicationCommandRegistriesBulkOverwrite" as const,

	/** A global or guild bulk overwrite failed; a null guild ID means global. */
	ApplicationCommandRegistriesBulkOverwriteError:
		"applicationCommandRegistriesBulkOverwriteError" as const,

	// Module store?
	/** A module finished activation and entered its store. */
	ModuleLoaded: "moduleLoaded" as const,
	/** A module was removed after successful cleanup. */
	ModuleUnloaded: "moduleUnloaded" as const,

	// Plugin
	/** One extension lifecycle hook completed successfully. */
	ExtensionLoaded: "extensionLoaded" as const,

	// Interaction handlers
	/** An interaction handler’s parse method returned an Option without throwing. */
	InteractionHandlerParseSuccess: "interactionHandlerParseSuccess" as const,
	/** A handler accepted an interaction with Some; its parsed value is included. */
	InteractionHandlerParseSome: "interactionHandlerParseSome" as const,
	/** A handler skipped an interaction with None. */
	InteractionHandlerParseNone: "interactionHandlerParseNone" as const,
	/** A handler’s parse method threw or rejected. */
	InteractionHandlerParseError: "interactionHandlerParseError" as const,
	/** An accepted interaction handler’s run method threw or rejected. */
	InteractionHandlerError: "interactionHandlerError" as const,

	// Autocomplete interaction
	/** An autocomplete interaction enters command lookup. */
	PossibleAutocompleteInteraction: "possibleAutocompleteInteraction" as const,
	/** A command’s autocomplete handler completed successfully. */
	CommandAutocompleteInteractionSuccess:
		"commandAutocompleteInteractionSuccess" as const,
	/** A command’s autocomplete handler threw or rejected. */
	CommandAutocompleteInteractionError:
		"commandAutocompleteInteractionError" as const,

	// Chat input command chain
	/** A slash interaction enters command lookup. */
	PossibleChatInputCommand: "possibleChatInputCommand" as const,
	/** No local command matched the slash interaction. */
	UnknownChatInputCommand: "unknownChatInputCommand" as const,
	/** The matched command has no slash handler. */
	CommandDoesNotHaveChatInputCommandHandler:
		"commandDoesNotHaveChatInputCommandHandler" as const,
	/** A slash command is ready for precondition checks. */
	PreChatInputCommandRun: "preChatInputCommandRun" as const,

	/** The slash command’s preconditions denied the invocation. */
	ChatInputCommandDenied: "chatInputCommandDenied" as const,
	/** The slash command’s preconditions passed. */
	ChatInputCommandAccepted: "chatInputCommandAccepted" as const,

	/** An accepted slash handler is about to run. */
	ChatInputCommandRun: "chatInputCommandRun" as const,
	/** A slash handler completed, with its return value and duration. */
	ChatInputCommandSuccess: "chatInputCommandSuccess" as const,
	/** A slash command attempt threw or rejected. */
	ChatInputCommandError: "chatInputCommandError" as const,
	/** A slash command attempt finished, with success state and duration. */
	ChatInputCommandFinish: "chatInputCommandFinish" as const,

	// Context menu chain
	/** A context-menu interaction enters command lookup. */
	PossibleContextMenuCommand: "possibleContextMenuCommand" as const,
	/** No local command matched the context-menu interaction. */
	UnknownContextMenuCommand: "unknownContextMenuCommand" as const,
	/** The matched command has no context-menu handler. */
	CommandDoesNotHaveContextMenuCommandHandler:
		"commandDoesNotHaveContextMenuCommandHandler" as const,
	/** A context-menu command is ready for precondition checks. */
	PreContextMenuCommandRun: "preContextMenuCommandRun" as const,

	/** The context-menu command’s preconditions denied the invocation. */
	ContextMenuCommandDenied: "contextMenuCommandDenied" as const,
	/** The context-menu command’s preconditions passed. */
	ContextMenuCommandAccepted: "contextMenuCommandAccepted" as const,

	/** An accepted context-menu handler is about to run. */
	ContextMenuCommandRun: "contextMenuCommandRun" as const,
	/** A context-menu handler completed, with its return value and duration. */
	ContextMenuCommandSuccess: "contextMenuCommandSuccess" as const,
	/** A context-menu command attempt threw or rejected. */
	ContextMenuCommandError: "contextMenuCommandError" as const,
	/** A context-menu command attempt finished, with success state and duration. */
	ContextMenuCommandFinish: "contextMenuCommandFinish" as const,

	// #endregion Virello events
} as const;

/** Module metadata attached to an error event. */
export interface IPieceError {
	/** Module associated with this event. */
	module: Module;
}

/** Data passed with the listener error event. */
export interface ListenerErrorPayload extends IPieceError {
	/** Module associated with this event. */
	module: Listener;
}

/** Data passed with the unknown message command name event. */
export interface UnknownMessageCommandNamePayload {
	/** Message that triggered this event. */
	message: Message;
	/** Configured string or regex prefix that matched. */
	prefix: string | RegExp;
	/** Exact prefix text matched in the message. */
	commandPrefix: string;
}

/** Data passed with the command does not have message command handler event. */
export interface CommandDoesNotHaveMessageCommandHandler {
	/** Message that triggered this event. */
	message: Message;
	/** Configured string or regex prefix that matched. */
	prefix: string | RegExp;
	/** Exact prefix text matched in the message. */
	commandPrefix: string;
	/** Command associated with this invocation. */
	command: Command;
}

/** Data passed with the unknown message command event. */
export interface UnknownMessageCommandPayload extends UnknownMessageCommandNamePayload {
	/** Parsed command name or alias. */
	commandName: string;
}

/** Message and command shared by message-command events. */
export interface IMessageCommandPayload extends PreconditionContext {
	/** Message that triggered this event. */
	message: Message;
	/** Command associated with this invocation. */
	command: MessageCommand;
}

/** Data passed with the pre message command run event. */
export type PreMessageCommandRunPayload = MessageCommandDeniedPayload;

/** Data passed with the message command denied event. */
export interface MessageCommandDeniedPayload extends IMessageCommandPayload {
	/** Raw text after the command name, before argument parsing. */
	parameters: string;
	/** Invocation metadata passed to the command. */
	context: MessageCommand.RunContext;
}

/** Data passed with the message command accepted event. */
export interface MessageCommandAcceptedPayload extends IMessageCommandPayload {
	/** Raw text after the command name, before argument parsing. */
	parameters: string;
	/** Invocation metadata passed to the command. */
	context: MessageCommand.RunContext;
}

/** Data passed with the message command run event. */
export interface MessageCommandRunPayload extends MessageCommandAcceptedPayload {
	/** Value returned by messagePreParse and passed to messageRun. */
	args: unknown;
}

/** Data passed with the message command finish event. */
export interface MessageCommandFinishPayload extends MessageCommandRunPayload {
	/** Whether the command attempt completed successfully. */
	success: boolean;
	/** Elapsed execution time in milliseconds, or -1 when the attempt failed before a duration was available. */
	duration: number;
}

/** Data passed with the message command error event. */
export interface MessageCommandErrorPayload extends MessageCommandRunPayload {
	/** Elapsed execution time in milliseconds, or -1 when the attempt failed before a duration was available. */
	duration: number;
}

/** Data passed with the message command success event. */
export interface MessageCommandSuccessPayload extends MessageCommandRunPayload {
	/** Value returned by the handler. */
	result: unknown;
	/** Elapsed execution time in milliseconds, or -1 when the attempt failed before a duration was available. */
	duration: number;
}

/** Data passed with the message command typing error event. */
export type MessageCommandTypingErrorPayload = MessageCommandRunPayload;

/** Data passed with the unknown chat input command event. */
export interface UnknownChatInputCommandPayload {
	/** Discord interaction that triggered this event. */
	interaction: ChatInputCommandInteraction;
	/** Invocation metadata passed to the command. */
	context: ChatInputCommandContext;
}

/** Data passed with the command does not have chat input command handler event. */
export interface CommandDoesNotHaveChatInputCommandHandlerPayload {
	/** Discord interaction that triggered this event. */
	interaction: ChatInputCommandInteraction;
	/** Command associated with this invocation. */
	command: Command;
	/** Invocation metadata passed to the command. */
	context: ChatInputCommandContext;
}

/** Interaction and command shared by slash-command events. */
export interface IChatInputCommandPayload extends PreconditionContext {
	/** Discord interaction that triggered this event. */
	interaction: ChatInputCommandInteraction;
	/** Command associated with this invocation. */
	command: ChatInputCommand;
}

/** Data passed with the pre chat input command run event. */
export interface PreChatInputCommandRunPayload extends IChatInputCommandPayload {
	/** Invocation metadata passed to the command. */
	context: ChatInputCommandContext;
}

/** Data passed with the chat input command denied event. */
export interface ChatInputCommandDeniedPayload extends IChatInputCommandPayload {
	/** Invocation metadata passed to the command. */
	context: ChatInputCommandContext;
}

/** Data passed with the chat input command accepted event. */
export type ChatInputCommandAcceptedPayload = PreChatInputCommandRunPayload;

/** Data passed with the chat input command run event. */
export type ChatInputCommandRunPayload = ChatInputCommandAcceptedPayload;

/** Data passed with the chat input command finish event. */
export interface ChatInputCommandFinishPayload extends ChatInputCommandAcceptedPayload {
	/** Whether the command attempt completed successfully. */
	success: boolean;
	/** Elapsed execution time in milliseconds, or -1 when the attempt failed before a duration was available. */
	duration: number;
}

/** Data passed with the chat input command success event. */
export interface ChatInputCommandSuccessPayload extends ChatInputCommandRunPayload {
	/** Value returned by the handler. */
	result: unknown;
	/** Elapsed execution time in milliseconds, or -1 when the attempt failed before a duration was available. */
	duration: number;
}

/** Data passed with the chat input command error event. */
export interface ChatInputCommandErrorPayload extends IChatInputCommandPayload {
	/** Elapsed execution time in milliseconds, or -1 when the attempt failed before a duration was available. */
	duration: number;
}

/** Data passed with the unknown context menu command event. */
export interface UnknownContextMenuCommandPayload {
	/** Discord interaction that triggered this event. */
	interaction: ContextMenuCommandInteraction;
	/** Invocation metadata passed to the command. */
	context: ContextMenuCommandContext;
}

/** Data passed with the command does not have context menu command handler event. */
export interface CommandDoesNotHaveContextMenuCommandHandlerPayload {
	/** Discord interaction that triggered this event. */
	interaction: ContextMenuCommandInteraction;
	/** Invocation metadata passed to the command. */
	context: ContextMenuCommandContext;
	/** Command associated with this invocation. */
	command: Command;
}

/** Interaction and command shared by context-menu events. */
export interface IContextMenuCommandPayload extends PreconditionContext {
	/** Discord interaction that triggered this event. */
	interaction: ContextMenuCommandInteraction;
	/** Command associated with this invocation. */
	command: ContextMenuCommand;
}

/** Data passed with the pre context menu command run event. */
export interface PreContextMenuCommandRunPayload extends IContextMenuCommandPayload {
	/** Invocation metadata passed to the command. */
	context: ContextMenuCommandContext;
}

/** Data passed with the context menu command denied event. */
export interface ContextMenuCommandDeniedPayload extends IContextMenuCommandPayload {
	/** Invocation metadata passed to the command. */
	context: ContextMenuCommandContext;
}

/** Data passed with the context menu command accepted event. */
export type ContextMenuCommandAcceptedPayload = PreContextMenuCommandRunPayload;

/** Data passed with the context menu command run event. */
export type ContextMenuCommandRunPayload = ContextMenuCommandAcceptedPayload;

/** Data passed with the context menu command finish event. */
export interface ContextMenuCommandFinishPayload extends ContextMenuCommandAcceptedPayload {
	/** Whether the command attempt completed successfully. */
	success: boolean;
	/** Elapsed execution time in milliseconds, or -1 when the attempt failed before a duration was available. */
	duration: number;
}

/** Data passed with the context menu command success event. */
export interface ContextMenuCommandSuccessPayload extends ContextMenuCommandRunPayload {
	/** Value returned by the handler. */
	result: unknown;
	/** Elapsed execution time in milliseconds, or -1 when the attempt failed before a duration was available. */
	duration: number;
}

/** Data passed with the context menu command error event. */
export interface ContextMenuCommandErrorPayload extends IContextMenuCommandPayload {
	/** Elapsed execution time in milliseconds, or -1 when the attempt failed before a duration was available. */
	duration: number;
}

/** Interaction and handler shared by interaction-handler events. */
export interface IInteractionHandlerPayload {
	/** Discord interaction that triggered this event. */
	interaction: Interaction;
	/** Interaction handler associated with the event. */
	handler: InteractionHandler;
}

/** Data passed with the interaction handler parse success event family. */
export type InteractionHandlerParseSuccess = IInteractionHandlerPayload;

/** Data passed with the interaction handler parse some event family. */
export interface InteractionHandlerParseSome<
	T = unknown,
> extends IInteractionHandlerPayload {
	/** Parsed value returned inside Some. */
	value: T;
}

/** Data passed with the interaction handler parse none event family. */
export type InteractionHandlerParseNone = IInteractionHandlerPayload;

/** Data passed with the interaction handler parse error event family. */
export type InteractionHandlerParseError = IInteractionHandlerPayload;

/** Data passed with the interaction handler error event family. */
export type InteractionHandlerError = IInteractionHandlerPayload;

/** Data passed with the autocomplete interaction event. */
export interface AutocompleteInteractionPayload {
	/** Discord interaction that triggered this event. */
	interaction: AutocompleteInteraction;
	/** Command associated with this invocation. */
	command: AutocompleteCommand;
	/** Invocation metadata passed to the command. */
	context: AutocompleteCommandContext;
}

/**
 * Local key alias for the typed event augmentation.
 * @internal
 */
declare const VirelloEvents: typeof Events;

/** Framework and native Discord event argument tuples. Augment this interface for custom events. */
export interface ClientEvents extends DiscordEvents {
	clientReady: [client: VirelloClient & Client<true>];
	shutdown: [];
	// #region Virello load cycle events
	/** A module was removed after successful cleanup. */
	[VirelloEvents.ModuleUnloaded]: [store: ModuleStore<Module>, module: Module];
	/** A module finished activation and entered its store. */
	[VirelloEvents.ModuleLoaded]: [store: ModuleStore<Module>, module: Module];

	/** A listener’s run method threw or rejected. */
	[VirelloEvents.ListenerError]: [
		error: unknown,
		payload: ListenerErrorPayload,
	];
	/** A command’s application-registration hook failed. */
	[VirelloEvents.CommandApplicationCommandRegistryError]: [
		error: unknown,
		command: Command,
	];
	/** Application command registration is starting. */
	[VirelloEvents.ApplicationCommandRegistriesInitialising]: [];
	/** The registration pass completed, with the registry map and elapsed milliseconds. */
	[VirelloEvents.ApplicationCommandRegistriesRegistered]: [
		registries: Map<string, ApplicationCommandRegistry>,
		timeTaken: number,
	];
	/** One global or guild command list was replaced; a null guild ID means global. */
	[VirelloEvents.ApplicationCommandRegistriesBulkOverwrite]: [
		result: Map<Snowflake, ApplicationCommand>,
		guildId: string | null,
	];
	/** A global or guild bulk overwrite failed; a null guild ID means global. */
	[VirelloEvents.ApplicationCommandRegistriesBulkOverwriteError]: [
		error: unknown,
		guildId: string | null,
	];

	/** A non-bot message enters prefix parsing. */
	[VirelloEvents.PreMessageParsed]: [message: Message];
	/** A message contains only the bot mention prefix. */
	[VirelloEvents.MentionPrefixOnly]: [message: Message];
	/** No configured or mention prefix matched the message. */
	[VirelloEvents.NonPrefixedMessage]: [message: Message];
	/** A message prefix matched, before command-name parsing. */
	[VirelloEvents.PrefixedMessage]: [message: Message, prefix: string | RegExp];

	/** No command name followed the matched prefix. */
	[VirelloEvents.UnknownMessageCommandName]: [
		payload: UnknownMessageCommandNamePayload,
	];
	/** The parsed message command name was not found. */
	[VirelloEvents.UnknownMessageCommand]: [
		payload: UnknownMessageCommandPayload,
	];
	/** A matched command has no messageRun handler. */
	[VirelloEvents.CommandDoesNotHaveMessageCommandHandler]: [
		payload: CommandDoesNotHaveMessageCommandHandler,
	];
	/** A message command is ready for precondition checks. */
	[VirelloEvents.PreMessageCommandRun]: [payload: PreMessageCommandRunPayload];

	/** Message command preconditions returned a denial. */
	[VirelloEvents.MessageCommandDenied]: [
		error: UserError,
		payload: MessageCommandDeniedPayload,
	];
	/** Message command preconditions passed; argument preparation and execution follow. */
	[VirelloEvents.MessageCommandAccepted]: [
		payload: MessageCommandAcceptedPayload,
	];

	/** A prepared message command is about to run. */
	[VirelloEvents.MessageCommandRun]: [
		message: Message,
		command: Command,
		payload: MessageCommandRunPayload,
	];
	/** A message command resolved successfully; the payload includes its result and duration. */
	[VirelloEvents.MessageCommandSuccess]: [
		payload: MessageCommandSuccessPayload,
	];
	/** The message-command run phase threw or rejected. Argument preparation failures are reported through ListenerError. */
	[VirelloEvents.MessageCommandError]: [
		error: unknown,
		payload: MessageCommandErrorPayload,
	];
	/** A message command attempt finished, with success state and duration. */
	[VirelloEvents.MessageCommandFinish]: [
		message: Message,
		command: Command,
		payload: MessageCommandFinishPayload,
	];

	/** Sending the message command’s typing indicator failed. */
	[VirelloEvents.MessageCommandTypingError]: [
		error: Error,
		payload: MessageCommandTypingErrorPayload,
	];

	/** One extension lifecycle hook completed successfully. */
	[VirelloEvents.ExtensionLoaded]: [
		hook: "setup" | "beforeLogin" | "afterLogin",
		name: string | undefined,
	];

	/** An interaction handler’s parse method returned an Option without throwing. */
	[VirelloEvents.InteractionHandlerParseSuccess]: [
		option: Option<unknown>,
		payload: InteractionHandlerParseSuccess,
	];
	/** A handler accepted an interaction with Some; its parsed value is included. */
	[VirelloEvents.InteractionHandlerParseSome]: [
		option: Option.Some<unknown>,
		payload: InteractionHandlerParseSome,
	];
	/** A handler skipped an interaction with None. */
	[VirelloEvents.InteractionHandlerParseNone]: [
		option: Option.None,
		payload: InteractionHandlerParseNone,
	];
	/** A handler’s parse method threw or rejected. */
	[VirelloEvents.InteractionHandlerParseError]: [
		error: unknown,
		payload: InteractionHandlerParseError,
	];
	/** An accepted interaction handler’s run method threw or rejected. */
	[VirelloEvents.InteractionHandlerError]: [
		error: unknown,
		payload: InteractionHandlerError,
	];

	/** An autocomplete interaction enters command lookup. */
	[VirelloEvents.PossibleAutocompleteInteraction]: [
		interaction: AutocompleteInteraction,
	];
	/** A command’s autocomplete handler threw or rejected. */
	[VirelloEvents.CommandAutocompleteInteractionError]: [
		error: unknown,
		payload: AutocompleteInteractionPayload,
	];
	/** A command’s autocomplete handler completed successfully. */
	[VirelloEvents.CommandAutocompleteInteractionSuccess]: [
		payload: AutocompleteInteractionPayload,
	];

	// Chat input command chain
	/** A slash interaction enters command lookup. */
	[VirelloEvents.PossibleChatInputCommand]: [
		interaction: ChatInputCommandInteraction,
	];
	/** No local command matched the slash interaction. */
	[VirelloEvents.UnknownChatInputCommand]: [
		payload: UnknownChatInputCommandPayload,
	];
	/** The matched command has no slash handler. */
	[VirelloEvents.CommandDoesNotHaveChatInputCommandHandler]: [
		payload: CommandDoesNotHaveChatInputCommandHandlerPayload,
	];
	/** A slash command is ready for precondition checks. */
	[VirelloEvents.PreChatInputCommandRun]: [
		payload: PreChatInputCommandRunPayload,
	];

	/** The slash command’s preconditions denied the invocation. */
	[VirelloEvents.ChatInputCommandDenied]: [
		error: UserError,
		payload: ChatInputCommandDeniedPayload,
	];
	/** The slash command’s preconditions passed. */
	[VirelloEvents.ChatInputCommandAccepted]: [
		payload: ChatInputCommandAcceptedPayload,
	];

	/** An accepted slash handler is about to run. */
	[VirelloEvents.ChatInputCommandRun]: [
		interaction: ChatInputCommandInteraction,
		command: ChatInputCommand,
		payload: ChatInputCommandRunPayload,
	];
	/** A slash handler completed, with its return value and duration. */
	[VirelloEvents.ChatInputCommandSuccess]: [
		payload: ChatInputCommandSuccessPayload,
	];
	/** A slash command attempt threw or rejected. */
	[VirelloEvents.ChatInputCommandError]: [
		error: unknown,
		payload: ChatInputCommandErrorPayload,
	];
	/** A slash command attempt finished, with success state and duration. */
	[VirelloEvents.ChatInputCommandFinish]: [
		interaction: ChatInputCommandInteraction,
		command: ChatInputCommand,
		payload: ChatInputCommandFinishPayload,
	];

	// Context menu command chain
	/** A context-menu interaction enters command lookup. */
	[VirelloEvents.PossibleContextMenuCommand]: [
		interaction: ContextMenuCommandInteraction,
	];
	/** No local command matched the context-menu interaction. */
	[VirelloEvents.UnknownContextMenuCommand]: [
		payload: UnknownContextMenuCommandPayload,
	];
	/** The matched command has no context-menu handler. */
	[VirelloEvents.CommandDoesNotHaveContextMenuCommandHandler]: [
		payload: CommandDoesNotHaveContextMenuCommandHandlerPayload,
	];
	/** A context-menu command is ready for precondition checks. */
	[VirelloEvents.PreContextMenuCommandRun]: [
		payload: PreContextMenuCommandRunPayload,
	];

	/** The context-menu command’s preconditions denied the invocation. */
	[VirelloEvents.ContextMenuCommandDenied]: [
		error: UserError,
		payload: ContextMenuCommandDeniedPayload,
	];
	/** The context-menu command’s preconditions passed. */
	[VirelloEvents.ContextMenuCommandAccepted]: [
		payload: ContextMenuCommandAcceptedPayload,
	];

	/** An accepted context-menu handler is about to run. */
	[VirelloEvents.ContextMenuCommandRun]: [
		interaction: ContextMenuCommandInteraction,
		command: ContextMenuCommand,
		payload: ContextMenuCommandRunPayload,
	];
	/** A context-menu handler completed, with its return value and duration. */
	[VirelloEvents.ContextMenuCommandSuccess]: [
		payload: ContextMenuCommandSuccessPayload,
	];
	/** A context-menu command attempt threw or rejected. */
	[VirelloEvents.ContextMenuCommandError]: [
		error: unknown,
		payload: ContextMenuCommandErrorPayload,
	];
	/** A context-menu command attempt finished, with success state and duration. */
	[VirelloEvents.ContextMenuCommandFinish]: [
		interaction: ContextMenuCommandInteraction,
		command: ContextMenuCommand,
		payload: ContextMenuCommandFinishPayload,
	];

	// #endregion Virello load cycle events

	// #region Termination
	/** Additional event names may supply arbitrary arguments. */
	[K: string]: unknown[];
	// #endregion Termination
}
