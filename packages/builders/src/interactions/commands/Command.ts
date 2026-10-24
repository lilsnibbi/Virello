import type { JSONEncodable } from "../../util/jsonEncodable";
import type {
	ApplicationIntegrationType,
	InteractionContextType,
	Permissions,
	RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import type { RestOrArray } from "../../util/normalizeArray";
import { normalizeArray } from "../../util/normalizeArray";

export type CommandData = Partial<
	Pick<
		RESTPostAPIApplicationCommandsJSONBody,
		| "contexts"
		| "default_member_permissions"
		| "integration_types"
		| "nsfw"
		| "dm_permission"
	>
>;

/**
 * The base class for all command builders.
 */
export abstract class CommandBuilder<
	Command extends RESTPostAPIApplicationCommandsJSONBody,
> implements JSONEncodable<Command> {
	/**
	 * The API data associated with this command.
	 *
	 * @internal
	 */
	declare protected readonly data: CommandData;

	/**
	 * Sets the contexts of this command.
	 *
	 * @param contexts - The contexts
	 */
	public setContexts(...contexts: RestOrArray<InteractionContextType>) {
		this.data.contexts = normalizeArray(contexts);
		return this;
	}

	/**
	 * Sets the integration types of this command.
	 *
	 * @param integrationTypes - The integration types
	 */
	public setIntegrationTypes(
		...integrationTypes: RestOrArray<ApplicationIntegrationType>
	) {
		this.data.integration_types = normalizeArray(integrationTypes);
		return this;
	}

	/**
	 * Sets the default permissions a member should have in order to run the command.
	 *
	 * @remarks
	 * You can set this to `'0'` to disable the command by default.
	 * @param permissions - The permissions bit field to set
	 * @see {@link https://discord.com/developers/docs/interactions/application-commands#permissions}
	 */
	public setDefaultMemberPermissions(
		permissions: Permissions | bigint | number | null,
	) {
		if (typeof permissions === "number" && !Number.isSafeInteger(permissions))
			throw new RangeError(
				"Numeric permissions must be a safe integer; use bigint or a decimal string for larger values.",
			);
		this.data.default_member_permissions =
			permissions === null || typeof permissions === "string"
				? permissions
				: permissions.toString();
		return this;
	}

	/**
	 * Legacy DM availability. Prefer setContexts for new global commands.
	 */
	public setDMPermission(enabled: boolean): this {
		this.data.dm_permission = enabled;
		return this;
	}

	/** Clears the default member permissions. */
	public clearDefaultMemberPermissions() {
		this.data.default_member_permissions = undefined;
		return this;
	}

	/**
	 * Sets whether this command is NSFW.
	 *
	 * @param nsfw - Whether this command is NSFW
	 */
	public setNSFW(nsfw = true) {
		this.data.nsfw = nsfw;
		return this;
	}

	/**
	 * Serializes this builder to API-compatible JSON data.
	 *
	 */
	public abstract toJSON(): Command;
}
