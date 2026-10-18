import {
	ClientPermissionsCheck as ClientPermissions,
	type PermissionPreconditionContext,
} from "./builtins/ClientPermissions";
import {
	CooldownCheck as Cooldown,
	type CooldownPreconditionContext,
} from "./builtins/Cooldown";
import { DMOnlyCheck as DMOnly } from "./builtins/DMOnly";
import { EnabledCheck as Enabled } from "./builtins/Enabled";
import { GuildNewsOnlyCheck as GuildNewsOnly } from "./builtins/GuildNewsOnly";
import { GuildNewsThreadOnlyCheck as GuildNewsThreadOnly } from "./builtins/GuildNewsThreadOnly";
import { GuildOnlyCheck as GuildOnly } from "./builtins/GuildOnly";
import { GuildPrivateThreadOnlyCheck as GuildPrivateThreadOnly } from "./builtins/GuildPrivateThreadOnly";
import { GuildPublicThreadOnlyCheck as GuildPublicThreadOnly } from "./builtins/GuildPublicThreadOnly";
import { GuildTextOnlyCheck as GuildTextOnly } from "./builtins/GuildTextOnly";
import { GuildThreadOnlyCheck as GuildThreadOnly } from "./builtins/GuildThreadOnly";
import { GuildVoiceOnlyCheck as GuildVoiceOnly } from "./builtins/GuildVoiceOnly";
import { NSFWCheck as NSFW } from "./builtins/NSFW";
import { RunInCheck as RunIn } from "./builtins/RunIn";
import { UserPermissionsCheck as UserPermissions } from "./builtins/UserPermissions";
/** Built-in precondition classes. Normal command use selects these by their registered names. */
export const CorePreconditions = {
	/** Require the bot’s configured permissions. */
	ClientPermissions,
	/** Consume a command’s cooldown bucket unless the caller is exempt. */
	Cooldown,
	/**
	 * Require a direct-message invocation.
	 * @deprecated Use the RunIn check with explicit channel types.
	 */
	DMOnly,
	/** Require command.enabled to be true. */
	Enabled,
	/** Require the invocation channel type to appear in the configured list. */
	RunIn,
	/**
	 * Require a guild announcement channel or announcement thread.
	 * @deprecated Use the RunIn check with explicit channel types.
	 */
	GuildNewsOnly,
	/**
	 * Apply the legacy announcement-thread check.
	 * @deprecated Use the RunIn check with explicit channel types.
	 */
	GuildNewsThreadOnly,
	/**
	 * Require a guild invocation.
	 * @deprecated Use the RunIn check with explicit channel types.
	 */
	GuildOnly,
	/**
	 * Apply the legacy private-thread check.
	 * @deprecated Use the RunIn check with explicit channel types.
	 */
	GuildPrivateThreadOnly,
	/**
	 * Apply the legacy public-thread check.
	 * @deprecated Use the RunIn check with explicit channel types.
	 */
	GuildPublicThreadOnly,
	/**
	 * Require a guild text channel, public thread, or private thread.
	 * @deprecated Use the RunIn check with explicit channel types.
	 */
	GuildTextOnly,
	/**
	 * Require a guild voice channel.
	 * @deprecated Use the RunIn check with explicit channel types.
	 */
	GuildVoiceOnly,
	/**
	 * Apply the legacy thread check.
	 * @deprecated Use the RunIn check with explicit channel types.
	 */
	GuildThreadOnly,
	/** Require the invocation channel’s nsfw field to be true. */
	NSFW,
	/** Require the invoking user’s configured permissions. */
	UserPermissions,
};

/** Types and helpers for {@link CorePreconditions}. */
export declare namespace CorePreconditions {
	/** Shorthand for {@link PermissionPreconditionContext}. */
	export type UserPermissionsPreconditionContext =
		PermissionPreconditionContext;
	/** Shorthand for {@link CooldownPreconditionContext}. */
	export type CooldownContext = CooldownPreconditionContext;
}
