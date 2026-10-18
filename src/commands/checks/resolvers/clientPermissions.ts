import {
	type PermissionInput as PermissionResolvable,
	Permissions as PermissionsBitField,
} from "../../../discord/permissions";
import { CommandPreConditions } from "../../enums";
import type { PreconditionContainerArray } from "../containers/Group";

/** Appends the `ClientPermissions` precondition when {@link Command.Options.requiredClientPermissions} resolves to a non-zero bitfield. */
export function parseConstructorPreConditionsRequiredClientPermissions(
	requiredClientPermissions: PermissionResolvable | undefined,
	preconditionContainerArray: PreconditionContainerArray,
) {
	const permissions = new PermissionsBitField(requiredClientPermissions);
	if (permissions.bitfield !== 0n) {
		preconditionContainerArray.append({
			name: CommandPreConditions.ClientPermissions,
			context: { permissions },
		});
	}
}
