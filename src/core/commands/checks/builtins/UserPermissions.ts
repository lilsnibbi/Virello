import { permissionsFor } from "../../../discord/permissions";
import type {
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
} from "discord.js";
import type { Message } from "discord.js";
import {
	Permissions as PermissionsBitField,
	directMessagePermissions,
} from "../../../discord/permissions";
import type { Command } from "../../Command";
import { Identifiers } from "../../errors/Identifiers";
import { AllFlowsPrecondition } from "../Precondition";
import {
	ClientPermissionsCheck,
	type PermissionPreconditionContext,
} from "./ClientPermissions";

/** Require the invoking user's channel permissions, using native member_permissions for interactions. */
export class UserPermissionsCheck extends AllFlowsPrecondition {
	public async messageRun(
		message: Message,
		_: Command,
		context: PermissionPreconditionContext,
	): AllFlowsPrecondition.AsyncResult {
		return this.sharedRun(
			context.permissions ?? new PermissionsBitField(),
			await permissionsFor(
				message.client,
				message.guildId,
				message.channelId,
				message.author.id,
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
			interaction.guildId
				? interaction.memberPermissions
				: directMessagePermissions,
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
			interaction.guildId
				? interaction.memberPermissions
				: directMessagePermissions,
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
				identifier: Identifiers.PreconditionUserPermissionsNoPermissions,
				message: `I was unable to resolve the end-user's permissions in the ${commandType} command invocation channel.`,
			});
		const missing = available.missing(required);
		return missing.length === 0
			? this.ok()
			: this.error({
					identifier: Identifiers.PreconditionUserPermissions,
					message: `You are missing the following permissions to run this command: ${missing.map((name) => ClientPermissionsCheck.readablePermissions[name] ?? name).join(", ")}`,
					context: { missing },
				});
	}
}
