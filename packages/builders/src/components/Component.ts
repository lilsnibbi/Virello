// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
import type { JSONEncodable } from "../util/jsonEncodable";
import type { APIBaseComponent, ComponentType } from "discord-api-types/v10";

export interface ComponentBuilderBaseData {
	id?: number | undefined;
}

/**
 * The base component builder that contains common symbols for all sorts of components.
 *
 * @typeParam Component - The type of API data that is stored within the builder
 */
export abstract class ComponentBuilder<
	Component extends APIBaseComponent<ComponentType>,
> implements JSONEncodable<Component> {
	/**
	 * @internal
	 */
	protected abstract readonly data: ComponentBuilderBaseData;

	/**
	 * Sets the id of this component.
	 *
	 * @param id - The id to use
	 */
	public setId(id: number) {
		this.data.id = id;
		return this;
	}

	/**
	 * Clears the id of this component, defaulting to a default incremented id.
	 */
	public clearId() {
		this.data.id = undefined;
		return this;
	}

	/**
	 * Serializes this builder to API-compatible JSON data.
	 *
	 */
	public abstract toJSON(): Component;
}
