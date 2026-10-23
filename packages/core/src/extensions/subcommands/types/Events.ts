import type { PreconditionContext } from "../../../commands/checks/Precondition";
import type { MessageContext as Message } from "../../../discord/MessageContext";
import { type Args } from "../../../commands/arguments/Args";
import { type UserError } from "../../../commands/errors/UserError";
import {
	type ChatInputCommand,
	type ChatInputCommandContext,
	type MessageCommand,
} from "../../../commands/types";
import { type MessageCommandDeniedPayload } from "../../../events/events";
import type { Subcommand } from "../Subcommand";
import type {
	ChatInputCommandSubcommandMappingMethod,
	MessageSubcommandMappingMethod,
	SubcommandMappingMethod,
} from "./mappings";

/** Subcommand lifecycle and dispatch event names. */
export const SubcommandEvents = {
	/** The slash subcommand preconditions denied the invocation. */
	ChatInputSubcommandDenied: "chatInputSubcommandDenied" as const,
	/** The slash subcommand handler is about to run. */
	ChatInputSubcommandRun: "chatInputSubcommandRun" as const,
	/** The slash subcommand handler completed successfully. */
	ChatInputSubcommandSuccess: "chatInputSubcommandSuccess" as const,
	/** The slash subcommand handler threw or rejected. */
	ChatInputSubcommandError: "chatInputSubcommandError" as const,
	/** The slash subcommand invocation matched no subcommand. */
	ChatInputSubcommandNoMatch: "chatInputSubcommandNoMatch" as const,

	/** The message subcommand preconditions denied the invocation. */
	MessageSubcommandDenied: "messageSubcommandDenied" as const,
	/** The message subcommand handler is about to run. */
	MessageSubcommandRun: "messageSubcommandRun" as const,
	/** The message subcommand handler completed successfully. */
	MessageSubcommandSuccess: "messageSubcommandSuccess" as const,
	/** The message subcommand handler threw or rejected. */
	MessageSubcommandError: "messageSubcommandError" as const,
	/** The message subcommand invocation matched no subcommand. */
	MessageSubcommandNoMatch: "messageSubcommandNoMatch" as const,

	/** The matched subcommand mapping has no usable message handler. */
	SubcommandMappingIsMissingMessageCommandHandler:
		"subcommandMappingIsMissingMessageCommandHandler" as const,
	/** The matched subcommand mapping has no usable slash handler. */
	SubcommandMappingIsMissingChatInputCommandHandler:
		"subcommandMappingIsMissingChatInputCommandHandler" as const,
};

/** Identifiers used when subcommand dispatch fails. */
export enum SubcommandErrors {
	/** No message subcommand mapping matched. */
	MessageSubcommandNoMatch = "messageSubcommandNoMatch",
	/** No slash subcommand mapping matched. */
	ChatInputSubcommandNoMatch = "chatInputSubcommandNoMatch",
	/** The requested subcommand could not be resolved. */
	SubcommandNotFound = "subcommandNotFound",
}

/** Data passed with the message subcommand no match context event. */
export interface MessageSubcommandNoMatchContext
	extends MessageCommand.RunContext {
	/** Command associated with this invocation. */
	command: Subcommand;
	/** Message-subcommand no-match identifier. */
	identifier: SubcommandErrors.MessageSubcommandNoMatch;
	/** Readable explanation of the failed match. */
	message: string;
	/** Possible second subcommand token, or null when absent. */
	possibleSubcommandName: string | null;
	/** Possible first group or subcommand token, or null when absent. */
	possibleSubcommandGroupOrName: string | null;
}

/** Data passed with the chat input subcommand no match context event. */
export interface ChatInputSubcommandNoMatchContext extends ChatInputCommandContext {
	/** Command associated with this invocation. */
	command: Subcommand;
	/** Slash-subcommand no-match identifier. */
	identifier: SubcommandErrors.ChatInputSubcommandNoMatch;
	/** Readable explanation of the failed match. */
	message: string;
}

/** Data passed with the message subcommand event family. */
export interface IMessageSubcommandPayload {
	/** Message that triggered this event. */
	message: Message;
	/** Command associated with this invocation. */
	command: Subcommand;
}

/** Data passed with the message subcommand denied event. */
export interface MessageSubcommandDeniedPayload
	extends
		Omit<MessageCommandDeniedPayload, "parameters" | "command">,
		MessageSubcommandAcceptedPayload {
	/** Original parameters when available; runtime subcommand checks may omit them. */
	parameters?: string;
}

/** Data passed with the message subcommand accepted event. */
export interface MessageSubcommandAcceptedPayload extends IMessageSubcommandPayload {
	/** Invocation metadata passed to the command. */
	context: MessageCommand.RunContext;
	/** Resolved message subcommand mapping. */
	matchedSubcommandMapping: SubcommandMappingMethod;
}

/** Data passed with the message subcommand run event. */
export type MessageSubcommandRunPayload = MessageSubcommandAcceptedPayload;

/** Data passed with the message subcommand error event. */
export type MessageSubcommandErrorPayload = MessageSubcommandRunPayload;

/** Data passed with the message subcommand success event. */
export interface MessageSubcommandSuccessPayload extends MessageSubcommandRunPayload {
	/** Value returned by the handler. */
	result: unknown;
}

/** Data passed with the chat input subcommand event family. */
export interface IChatInputSubcommandPayload extends PreconditionContext {
	/** Discord interaction that triggered this event. */
	interaction: ChatInputCommand.Interaction;
	/** Command associated with this invocation. */
	command: Subcommand;
}

/** Data passed with the chat input subcommand accepted event. */
export interface ChatInputSubcommandAcceptedPayload extends IChatInputSubcommandPayload {
	/** Invocation metadata passed to the command. */
	context: ChatInputCommand.RunContext;
	/** Resolved slash subcommand mapping. */
	matchedSubcommandMapping: SubcommandMappingMethod;
}

/** Data passed with the chat input subcommand denied event. */
export type ChatInputSubcommandDeniedPayload =
	ChatInputSubcommandAcceptedPayload;

/** Data passed with the chat input subcommand run event. */
export type ChatInputSubcommandRunPayload = ChatInputSubcommandAcceptedPayload;

/** Data passed with the chat input subcommand error event. */
export type ChatInputSubcommandErrorPayload = ChatInputSubcommandRunPayload;

/** Data passed with the chat input subcommand success event. */
export interface ChatInputSubcommandSuccessPayload extends ChatInputSubcommandRunPayload {
	/** Value returned by the handler. */
	result: unknown;
}

/** Add subcommand event argument tuples to discord.js. */
declare module "../../../events/events" {
	/** Arguments passed with SubcommandEvents. */
	interface ClientEvents {
		/** The slash subcommand preconditions denied the invocation. */
		[SubcommandEvents.ChatInputSubcommandDenied]: [
			error: UserError,
			payload: ChatInputSubcommandDeniedPayload,
		];
		/** The slash subcommand handler is about to run. */
		[SubcommandEvents.ChatInputSubcommandRun]: [
			interaction: ChatInputCommand.Interaction,
			subcommand: ChatInputCommandSubcommandMappingMethod,
			payload: ChatInputSubcommandRunPayload,
		];
		/** The slash subcommand handler completed successfully. */
		[SubcommandEvents.ChatInputSubcommandSuccess]: [
			interaction: ChatInputCommand.Interaction,
			subcommand: ChatInputCommandSubcommandMappingMethod,
			payload: ChatInputSubcommandSuccessPayload,
		];
		/** The slash subcommand handler threw or rejected. */
		[SubcommandEvents.ChatInputSubcommandError]: [
			error: unknown,
			payload: ChatInputSubcommandErrorPayload,
		];
		/** The slash subcommand invocation matched no subcommand. */
		[SubcommandEvents.ChatInputSubcommandNoMatch]: [
			interaction: ChatInputCommand.Interaction,
			context: ChatInputSubcommandNoMatchContext,
		];

		/** The message subcommand preconditions denied the invocation. */
		[SubcommandEvents.MessageSubcommandDenied]: [
			error: UserError,
			payload: MessageSubcommandDeniedPayload,
		];
		/** The message subcommand handler is about to run. */
		[SubcommandEvents.MessageSubcommandRun]: [
			message: Message,
			subcommand: MessageSubcommandMappingMethod,
			payload: MessageSubcommandRunPayload,
		];
		/** The message subcommand handler completed successfully. */
		[SubcommandEvents.MessageSubcommandSuccess]: [
			message: Message,
			subcommand: MessageSubcommandMappingMethod,
			payload: MessageSubcommandSuccessPayload,
		];
		/** The message subcommand handler threw or rejected. */
		[SubcommandEvents.MessageSubcommandError]: [
			error: unknown,
			payload: MessageSubcommandErrorPayload,
		];
		/** The message subcommand invocation matched no subcommand. */
		[SubcommandEvents.MessageSubcommandNoMatch]: [
			message: Message,
			args: Args,
			context: MessageSubcommandNoMatchContext,
		];

		/** The matched subcommand mapping has no usable message handler. */
		[SubcommandEvents.SubcommandMappingIsMissingMessageCommandHandler]: [
			message: Message,
			subcommand: SubcommandMappingMethod,
			payload: MessageSubcommandAcceptedPayload,
		];
		/** The matched subcommand mapping has no usable slash handler. */
		[SubcommandEvents.SubcommandMappingIsMissingChatInputCommandHandler]: [
			message: ChatInputCommand.Interaction,
			subcommand: SubcommandMappingMethod,
			payload: ChatInputSubcommandAcceptedPayload,
		];
	}
}
