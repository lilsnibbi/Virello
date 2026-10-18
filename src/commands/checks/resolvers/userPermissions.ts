import {
	type PermissionInput as PermissionResolvable,
	Permissions as PermissionsBitField,
} from "../../../discord/permissions";
import { CommandPreConditions } from "../../enums";
import type { PreconditionContainerArray } from "../containers/Group";

/** Appends the `UserPermissions` precondition when {@link Command.Options.requiredUserPermissions} resolves to a non-zero bitfield. */
export function parseConstructorPreConditionsRequiredUserPermissions(
	requiredUserPermissions: PermissionResolvable | undefined,
	preconditionContainerArray: PreconditionContainerArray,
) {
	const permissions = new PermissionsBitField(requiredUserPermissions);
	if (permissions.bitfield !== 0n) {
		preconditionContainerArray.append({
			name: CommandPreConditions.UserPermissions,
			context: { permissions },
		});
	}
}
