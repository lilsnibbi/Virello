// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import {
	type APIRoleSelectComponent,
	ComponentType,
	SelectMenuDefaultValueType,
	type Snowflake,
} from "discord-api-types/v10";
import { normalizeArray, type RestOrArray } from "../../util/normalizeArray";
import { validate } from "../../util/validation";
import { selectMenuRolePredicate } from "../Assertions";
import { BaseSelectMenuBuilder } from "./BaseSelectMenu";

/**
 * A builder that creates API-compatible JSON data for role select menus.
 */
export class RoleSelectMenuBuilder extends BaseSelectMenuBuilder<APIRoleSelectComponent> {
	protected override readonly data: Partial<APIRoleSelectComponent>;

	/**
	 * Creates a new role select menu.
	 *
	 * @param data - The API data to create this role select menu with
	 * @example
	 * Creating a select menu from an API data object:
	 * ```ts
	 * const selectMenu = new RoleSelectMenuBuilder({
	 * 	custom_id: 'a cool select menu',
	 * 	placeholder: 'select an option',
	 * 	max_values: 2,
	 * });
	 * ```
	 * @example
	 * Creating a select menu using setters and API data:
	 * ```ts
	 * const selectMenu = new RoleSelectMenuBuilder({
	 * 	custom_id: 'a cool select menu',
	 * })
	 * 	.setMinValues(1);
	 * ```
	 */
	public constructor(data: Partial<APIRoleSelectComponent> = {}) {
		super();
		this.data = { ...structuredClone(data), type: ComponentType.RoleSelect };
	}

	/**
	 * Adds default roles to this auto populated select menu.
	 *
	 * @param roles - The roles to add
	 */
	public addDefaultRoles(...roles: RestOrArray<Snowflake>) {
		const normalizedValues = normalizeArray(roles);
		this.data.default_values ??= [];

		this.data.default_values.push(
			...normalizedValues.map((id) => ({
				id,
				type: SelectMenuDefaultValueType.Role as const,
			})),
		);

		return this;
	}

	/**
	 * Sets default roles for this auto populated select menu.
	 *
	 * @param roles - The roles to set
	 */
	public setDefaultRoles(...roles: RestOrArray<Snowflake>) {
		const normalizedValues = normalizeArray(roles);

		this.data.default_values = normalizedValues.map((id) => ({
			id,
			type: SelectMenuDefaultValueType.Role as const,
		}));

		return this;
	}

	/**
	 * {@inheritDoc ComponentBuilder.toJSON}
	 */
	public override toJSON(): APIRoleSelectComponent {
		const clone = structuredClone(this.data);
		validate(selectMenuRolePredicate, clone);

		return clone as APIRoleSelectComponent;
	}
}
