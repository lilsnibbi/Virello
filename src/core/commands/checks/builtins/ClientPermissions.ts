import { permissionsFor } from "../../../discord/permissions";
import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "discord.js";
import type { Message } from "discord.js";
import {
	Permissions as PermissionsBitField,
	directMessagePermissions,
	type PermissionName as PermissionsString,
} from "../../../discord/permissions";
import type { Command } from "../../Command";
import { Identifiers } from "../../errors/Identifiers";
import { AllFlowsPrecondition } from "../Precondition";

export interface PermissionPreconditionContext
	extends AllFlowsPrecondition.RunContext {
	permissions?: PermissionsBitField;
}

/** Require the bot's channel permissions. Interactions use Discord's supplied app_permissions snapshot. */
export class ClientPermissionsCheck extends AllFlowsPrecondition {
	public async messageRun(
		message: Message,
		_: Command,
		context: PermissionPreconditionContext,
	): AllFlowsPrecondition.AsyncResult {
		if (!message.client.user?.id)
			return this.error({
				identifier: Identifiers.PreconditionClientPermissionsNoClient,
				message: "There was no client to validate the permissions for.",
			});
		return this.sharedRun(
			context.permissions ?? new PermissionsBitField(),
			await permissionsFor(
				message.client,
				message.guildId,
				message.channelId,
				message.client.user?.id,
			),
			"message",
		);
	}
	public chatInputRun(
		interaction: ChatInputCommandInteraction,
		_: Command,
		context: PermissionPreconditionContext,
	): AllFlowsPrecondition.Result {
		return this.sharedRun(
			context.permissions ?? new PermissionsBitField(),
			interaction.appPermissions ??
				(interaction.guildId ? null : directMessagePermissions),
			"chat input",
		);
	}
	public contextMenuRun(
		interaction: ContextMenuCommandInteraction,
		_: Command,
		context: PermissionPreconditionContext,
	): AllFlowsPrecondition.Result {
		return this.sharedRun(
			context.permissions ?? new PermissionsBitField(),
			interaction.appPermissions ??
				(interaction.guildId ? null : directMessagePermissions),
			"context menu",
		);
	}
	private sharedRun(
		required: PermissionsBitField,
		available: PermissionsBitField | null,
		commandType: string,
	): AllFlowsPrecondition.Result {
		if (!available)
			return this.error({
				identifier: Identifiers.PreconditionClientPermissionsNoPermissions,
				message: `I was unable to resolve my permissions in the ${commandType} command invocation channel.`,
			});
		const missing = available.missing(required);
		return missing.length === 0
			? this.ok()
			: this.error({
					identifier: Identifiers.PreconditionClientPermissions,
					message: `I am missing the following permissions to run this command: ${missing.map((name) => ClientPermissionsCheck.readablePermissions[name] ?? name).join(", ")}`,
					context: { missing },
				});
	}
	/** Readable labels used when reporting missing Discord permissions. */
	public static readonly readablePermissions: Record<
		PermissionsString,
		string
	> = {
		SetVoiceChannelStatus: "Set Voice Channel Status",
		BypassSlowmode: "Bypass Slowmode",
		AddReactions: "Add Reactions",
		Administrator: "Administrator",
		AttachFiles: "Attach Files",
		BanMembers: "Ban Members",
		ChangeNickname: "Change Nickname",
		Connect: "Connect",
		CreateEvents: "Create Events",
		CreateGuildExpressions: "Create Expressions",
		CreateInstantInvite: "Create Instant Invite",
		CreatePrivateThreads: "Create Private Threads",
		CreatePublicThreads: "Create Public Threads",
		DeafenMembers: "Deafen Members",
		EmbedLinks: "Embed Links",
		KickMembers: "Kick Members",
		ManageChannels: "Manage Channels",
		ManageEmojisAndStickers: "Manage Emojis and Stickers",
		ManageEvents: "Manage Events",
		ManageGuild: "Manage Server",
		ManageGuildExpressions: "Manage Guild Expressions",
		ManageMessages: "Manage Messages",
		ManageNicknames: "Manage Nicknames",
		ManageRoles: "Manage Roles",
		ManageThreads: "Manage Threads",
		ManageWebhooks: "Manage Webhooks",
		MentionEveryone: "Mention Everyone",
		ModerateMembers: "Moderate Members",
		MoveMembers: "Move Members",
		MuteMembers: "Mute Members",
		PinMessages: "Pin Messages",
		PrioritySpeaker: "Priority Speaker",
		ReadMessageHistory: "Read Message History",
		RequestToSpeak: "Request to Speak",
		SendMessages: "Send Messages",
		SendMessagesInThreads: "Send Messages in Threads",
		SendPolls: "Create Polls",
		SendTTSMessages: "Send TTS Messages",
		SendVoiceMessages: "Send Voice Messages",
		Speak: "Speak",
		Stream: "Stream",
		UseApplicationCommands: "Use Application Commands",
		UseEmbeddedActivities: "Start Activities",
		UseExternalApps: "Use External Apps",
		UseExternalEmojis: "Use External Emojis",
		UseExternalSounds: "Use External Sounds",
		UseExternalStickers: "Use External Stickers",
		UseSoundboard: "Use Soundboard",
		UseVAD: "Use Voice Activity",
		ViewAuditLog: "View Audit Log",
		ViewChannel: "Read Messages",
		ViewCreatorMonetizationAnalytics: "View Creator Monetization Analytics",
		ViewGuildInsights: "View Guild Insights",
	};
}
