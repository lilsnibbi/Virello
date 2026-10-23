import { MessageContext as Message } from "../../discord/MessageContext";
import type { InteractionContext as BaseInteraction } from "../../discord/InteractionContext";
import {
	Permissions,
	directMessagePermissions,
	type PermissionInput,
} from "../../discord/permissions";
import { UserError } from "../../commands/errors/UserError";
import { createFunctionPrecondition, type FunctionFallback } from "./utils";

/** UserError identifiers thrown by permission decorators. */
export enum DecoratorIdentifiers {
	/** Bot permission requirements cannot be used in this DM context. */
	RequiresClientPermissionsGuildOnly = "requiresClientPermissionsGuildOnly",
	/** The bot’s guild member lacks a required permission. */
	RequiresClientPermissionsMissingPermissions = "requiresClientPermissionsMissingPermissions",
	/** User permission requirements cannot be used in this DM context. */
	RequiresUserPermissionsGuildOnly = "requiresUserPermissionsGuildOnly",
	/** The RequiresUserPermissions guild check found missing permissions. */
	RequiresUserPermissionsMissingPermissions = "requiresUserPermissionsMissingPermissions",
}

/** Check bot permissions for a method invocation. Message checks may fetch missing native cache data. */
export const RequiresClientPermissions = (
	...required: PermissionInput[]
): MethodDecorator => permissionDecorator("client", required);
/** Check the invoking user's permissions. Interaction checks use Discord's member permission snapshot. */
export const RequiresUserPermissions = (
	...required: PermissionInput[]
): MethodDecorator => permissionDecorator("user", required);

function permissionDecorator(
	target: "client" | "user",
	input: PermissionInput[],
): MethodDecorator {
	const required = new Permissions(input);
	return createFunctionPrecondition(
		async (context: Message | BaseInteraction) => {
			if (!context.guildId && !directMessagePermissions.has(required, false))
				throw new UserError({
					identifier:
						target === "client"
							? DecoratorIdentifiers.RequiresClientPermissionsGuildOnly
							: DecoratorIdentifiers.RequiresUserPermissionsGuildOnly,
					message:
						target === "client"
							? "Sorry, but that command can only be used in a server because I do not have sufficient permissions in DMs"
							: "Sorry, but that command can only be used in a server because you do not have sufficient permissions in DMs",
				});
			let available: Permissions | null;
			if (!context.guildId) available = directMessagePermissions;
			else if (context instanceof Message) {
				const userId =
					target === "user" ? context.author.id : context.client.user?.id;
				available = userId ? await context.permissionsFor(userId) : null;
			} else
				available =
					target === "user"
						? context.memberPermissions
						: context.appPermissions;
			const missing = (available ?? new Permissions()).missing(required);
			if (missing.length)
				throw new UserError({
					identifier:
						target === "client"
							? DecoratorIdentifiers.RequiresClientPermissionsMissingPermissions
							: DecoratorIdentifiers.RequiresUserPermissionsMissingPermissions,
					message:
						target === "client"
							? `Sorry, but I am not allowed to do that. I am missing the permissions: ${missing.join(",")}`
							: `Sorry, but you are not allowed to do that. You are missing the permissions: ${missing.join(",")}`,
					context: { missing },
				});
			return true;
		},
	);
}

/** Run only for a guild invocation. A configured fallback handles other contexts. */
export function RequiresGuildContext(
	fallback: FunctionFallback<[Message | BaseInteraction]> = () => undefined,
): MethodDecorator {
	return createFunctionPrecondition(
		(context: Message | BaseInteraction) => context.guildId !== null,
		fallback,
	);
}
/** Run only for a direct-message invocation. */
export function RequiresDMContext(
	fallback: FunctionFallback<[Message | BaseInteraction]> = () => undefined,
): MethodDecorator {
	return createFunctionPrecondition(
		(context: Message | BaseInteraction) => context.guildId === null,
		fallback,
	);
}
