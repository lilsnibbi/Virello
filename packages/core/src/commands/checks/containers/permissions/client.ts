import {
	type PermissionInput as PermissionResolvable,
	Permissions as PermissionsBitField,
} from "../../../../discord/permissions";
import type { PreconditionSingleResolvableDetails } from "../Entry";

/** Create a contextful permissions precondition requirement. */
export class ClientPermissionsPrecondition implements PreconditionSingleResolvableDetails<"ClientPermissions"> {
	/** Registered client permission check name. */
	public name: "ClientPermissions";
	/** Permission context passed to the check. */
	public context: {
		/** Required bot permissions. */
		permissions: PermissionsBitField;
	};

	/**
	 * Create a permission-check entry.
	 * @param permissions - Required bot permissions, resolved into a PermissionsBitField.
	 */
	public constructor(permissions: PermissionResolvable) {
		this.name = "ClientPermissions";
		this.context = {
			permissions: new PermissionsBitField(permissions),
		};
	}
}
