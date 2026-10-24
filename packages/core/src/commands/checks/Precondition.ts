import type {
	ChannelType,
	APIChannel as TextBasedChannel,
} from "discord-api-types/v10";
import type {
	ChatInputCommandInteraction,
	CommandInteraction,
	ContextMenuCommandInteraction,
} from "../../discord/InteractionContext";
import type { MessageContext as Message } from "../../discord/MessageContext";
import type { Permissions as PermissionsBitField } from "../../discord/permissions";
import { Module } from "../../core/modules/index";
import type { Awaitable } from "@virello/util/general";
import { Result } from "@virello/util/result";
import { PreconditionError } from "../errors/PreconditionError";
import type { UserError } from "../errors/UserError";
import type {
	ChatInputCommand,
	ContextMenuCommand,
	MessageCommand,
} from "../types";
import type { CooldownPreconditionContext } from "./builtins/Cooldown";

/** A command-check Result, returned immediately or asynchronously. Err denies the command. */
export type PreconditionResult = Awaitable<Result<unknown, UserError>>;
/** An asynchronous command-check Result. Err denies the command. */
export type AsyncPreconditionResult = Promise<Result<unknown, UserError>>;

/** Command check module. Implement each command flow that will use this check. */
export class Precondition<
	Options extends Precondition.Options = Precondition.Options,
> extends Module<Options, "preconditions"> {
	/** Optional class metadata passed as constructor options by the loader. */
	public static override readonly options?: Precondition.Options;
	/** Global execution position, in ascending order, or null to run only when explicitly configured. */
	public readonly position: number | null;

	/**
	 * Create a check module.
	 * @param context - Loader metadata and precondition store.
	 * @param options - Module settings and optional global position; defaults to an empty object.
	 */
	public constructor(
		context: Precondition.Context,
		options: Options = {} as Options,
	) {
		super(context, options);
		this.position = options.position ?? null;
	}

	/**
	 * Check one message command invocation.
	 * @param message - Triggering message.
	 * @param command - Command being checked.
	 * @param context - Invocation data and check-specific settings.
	 * @returns Ok to allow or Err with a UserError to deny, immediately or asynchronously.
	 */
	public messageRun?(
		message: Message,
		command: MessageCommand,
		context: Precondition.RunContext,
	): Precondition.Result;

	/**
	 * Check one slash command invocation.
	 * @param interaction - Triggering interaction.
	 * @param command - Command being checked.
	 * @param context - Invocation data and check-specific settings.
	 * @returns Ok to allow or Err with a UserError to deny, immediately or asynchronously.
	 */
	public chatInputRun?(
		interaction: ChatInputCommandInteraction,
		command: ChatInputCommand,
		context: Precondition.RunContext,
	): Precondition.Result;

	/**
	 * Check one context-menu command invocation.
	 * @param interaction - Triggering interaction.
	 * @param command - Command being checked.
	 * @param context - Invocation data and check-specific settings.
	 * @returns Ok to allow or Err with a UserError to deny, immediately or asynchronously.
	 */
	public contextMenuRun?(
		interaction: ContextMenuCommandInteraction,
		command: ContextMenuCommand,
		context: Precondition.RunContext,
	): Precondition.Result;

	/** Allow the invocation by returning an empty Ok result. */
	public ok(): Precondition.Result {
		return Result.ok();
	}

	/** Create a {@link PreconditionError} with the precondition parameter set to `this`. */
	public error(
		options: Omit<PreconditionError.Options, "precondition"> = {},
	): Precondition.Result {
		return Result.err(
			new PreconditionError({ precondition: this, ...options }),
		);
	}

	/**
	 * Fetch the interaction channel without caching it, allowing an unknown guild.
	 * @param interaction - Command interaction whose channel is requested.
	 * @returns The fetched value typed as TextBasedChannel; no additional type or null check is performed.
	 * @throws If the Discord fetch rejects.
	 */
	protected async fetchChannelFromInteraction(
		interaction: CommandInteraction,
	): Promise<TextBasedChannel> {
		if (!interaction.channelId)
			throw new Error("This interaction has no channel.");
		return interaction.client.engine.fetchChannel(interaction.channelId);
	}
	/** Resolve a full message channel even when channel caching is disabled. */
	protected async fetchChannelFromMessage(
		message: Message,
	): Promise<TextBasedChannel> {
		return (
			message.channel ?? message.client.engine.fetchChannel(message.channelId)
		);
	}
}

/** Precondition base that requires handlers for message, slash, and context-menu commands. */
export abstract class AllFlowsPrecondition extends Precondition {
	/**
	 * Check one message command invocation.
	 * @param message - Triggering message.
	 * @param command - Command being checked.
	 * @param context - Invocation data and check-specific settings.
	 * @returns Ok to allow or Err with a UserError to deny, immediately or asynchronously.
	 */
	public abstract override messageRun(
		message: Message,
		command: MessageCommand,
		context: Precondition.RunContext,
	): Precondition.Result;

	/**
	 * Check one slash command invocation.
	 * @param interaction - Triggering interaction.
	 * @param command - Command being checked.
	 * @param context - Invocation data and check-specific settings.
	 * @returns Ok to allow or Err with a UserError to deny, immediately or asynchronously.
	 */
	public abstract override chatInputRun(
		interaction: ChatInputCommandInteraction,
		command: ChatInputCommand,
		context: Precondition.RunContext,
	): Precondition.Result;

	/**
	 * Check one context-menu command invocation.
	 * @param interaction - Triggering interaction.
	 * @param command - Command being checked.
	 * @param context - Invocation data and check-specific settings.
	 * @returns Ok to allow or Err with a UserError to deny, immediately or asynchronously.
	 */
	public abstract override contextMenuRun(
		interaction: ContextMenuCommandInteraction,
		command: ContextMenuCommand,
		context: Precondition.RunContext,
	): Precondition.Result;
}

/** The registered preconditions and their contexts, if any. */
export interface Preconditions {
	/** Apply the selected subcommand’s cooldown. Supply cooldown context. */
	SubcommandCooldown: import("../../extensions/subcommands/preconditions/SubcommandCooldown").SubcommandCooldownPreconditionContext;
	/** Apply a command cooldown. Supply cooldown context. */
	Cooldown: CooldownPreconditionContext;
	/** Require a direct message. No extra context is needed. */
	DMOnly: never;
	/** Require an enabled command. No extra context is needed. */
	Enabled: never;
	/** Require an announcement channel or announcement thread. No extra context is needed. */
	GuildNewsOnly: never;
	/** Apply the legacy announcement-thread check. No extra context is needed. */
	GuildNewsThreadOnly: never;
	/** Require a guild invocation. No extra context is needed. */
	GuildOnly: never;
	/** Apply the legacy private-thread check. No extra context is needed. */
	GuildPrivateThreadOnly: never;
	/** Apply the legacy public-thread check. No extra context is needed. */
	GuildPublicThreadOnly: never;
	/** Require a guild text channel, public thread, or private thread. No extra context is needed. */
	GuildTextOnly: never;
	/** Require a guild voice channel. No extra context is needed. */
	GuildVoiceOnly: never;
	/** Apply the legacy thread check. No extra context is needed. */
	GuildThreadOnly: never;
	/** Require a channel explicitly marked NSFW. No extra context is needed. */
	NSFW: never;
	/** Allowed channel types for the RunIn check. */
	RunIn: {
		/** Allowed channel types shared by all flows, or separate lists for each handler. */
		types: readonly ChannelType[] | RunInPreconditionCommandSpecificData;
	};
	/** Required bot permission context. */
	ClientPermissions: {
		/** Permissions the bot must have for this invocation. */
		permissions: PermissionsBitField;
	};
	/** Required invoking-user permission context. */
	UserPermissions: {
		/** Permissions the invoking user must have. */
		permissions: PermissionsBitField;
	};
}

/** Allowed channels for each kind of command. */
export interface RunInPreconditionCommandSpecificData {
	/** Allowed channel types for message commands. */
	messageRun: readonly ChannelType[];
	/** Allowed channel types for slash commands. */
	chatInputRun: readonly ChannelType[];
	/** Allowed channel types for context-menu commands. */
	contextMenuRun: readonly ChannelType[];
}

/** Names registered in the augmentable Preconditions interface. */
export type PreconditionKeys = keyof Preconditions;
/** Names of checks that need no extra context. */
export type SimplePreconditionKeys = {
	[K in PreconditionKeys]: Preconditions[K] extends never ? K : never;
}[PreconditionKeys];

/** Module settings plus an optional global execution position. */
export interface PreconditionOptions extends Module.Options {
	/** The position for the precondition to be set at in the global precondition list. If set to `null`, this precondition will not be set as a global one.
	 * @default null */
	position?: number | null;
}

/** Extra invocation data passed to command checks. */
export interface PreconditionContext extends Record<PropertyKey, unknown> {
	/** Marks a check for another command. Built-in cooldown checks skip consumption when true. */
	external?: boolean;
}

/** Types and helpers for {@link Precondition}. */
export declare namespace Precondition {
	/** Shorthand for {@link PreconditionOptions}. */
	export type Options = PreconditionOptions;
	/** Shorthand for {@link Module.Context}. */
	export type Context = Module.Context<"preconditions">;
	/** Shorthand for {@link PreconditionContext}. */
	export type RunContext = PreconditionContext;
	/** Shorthand for {@link PreconditionResult}. */
	export type Result = PreconditionResult;
	/** Shorthand for {@link AsyncPreconditionResult}. */
	export type AsyncResult = AsyncPreconditionResult;
}

/** Types and helpers for {@link AllFlowsPrecondition}. */
export declare namespace AllFlowsPrecondition {
	/** Shorthand for {@link PreconditionOptions}. */
	export type Options = PreconditionOptions;
	/** Shorthand for {@link Module.Context}. */
	export type Context = Module.Context<"preconditions">;
	/** Shorthand for {@link PreconditionContext}. */
	export type RunContext = PreconditionContext;
	/** Shorthand for {@link PreconditionResult}. */
	export type Result = PreconditionResult;
	/** Shorthand for {@link AsyncPreconditionResult}. */
	export type AsyncResult = AsyncPreconditionResult;
}
