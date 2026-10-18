import {
	type PermissionInput as PermissionResolvable,
	Permissions as PermissionsBitField,
} from "../../../../discord/permissions";
import type { PreconditionSingleResolvableDetails } from "../Entry";

/** Create a contextful permissions precondition requirement. */
export class UserPermissionsPrecondition implements PreconditionSingleResolvableDetails<"UserPermissions"> {
	/** Registered user permission check name. */
	public name: "UserPermissions";
	/** Permission context passed to the check. */
	public context: {
		/** Required invoking-user permissions. */
		permissions: PermissionsBitField;
	};

	/**
	 * Create a permission-check entry.
	 * @param permissions - Required invoking-user permissions, resolved into a PermissionsBitField.
	 */
	public constructor(permissions: PermissionResolvable) {
		this.name = "UserPermissions";
		this.context = {
			permissions: new PermissionsBitField(permissions),
		};
	}
}
