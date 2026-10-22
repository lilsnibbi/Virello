// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import type {
	APISeparatorComponent,
	SeparatorSpacingSize,
} from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { validate } from "../../util/validation";
import { ComponentBuilder } from "../Component";
import { separatorPredicate } from "./Assertions";

/**
 * A builder that creates API-compatible JSON data for separators.
 */
export class SeparatorBuilder extends ComponentBuilder<APISeparatorComponent> {
	/**
	 * @internal
	 */
	protected readonly data: Partial<APISeparatorComponent>;

	/**
	 * Creates a new separator.
	 *
	 * @param data - The API data to create this separator with
	 * @example
	 * Creating a separator from an API data object:
	 * ```ts
	 * const separator = new SeparatorBuilder({
	 * 	spacing: SeparatorSpacingSize.Small,
	 *  divider: true,
	 * });
	 * ```
	 * @example
	 * Creating a separator using setters and API data:
	 * ```ts
	 * const separator = new SeparatorBuilder({
	 * 	spacing: SeparatorSpacingSize.Large,
	 * })
	 * 	.setDivider(false);
	 * ```
	 */
	public constructor(data: Partial<APISeparatorComponent> = {}) {
		super();
		this.data = {
			...structuredClone(data),
			type: ComponentType.Separator,
		};
	}

	/**
	 * Sets whether this separator should show a divider line.
	 *
	 * @param divider - Whether to show a divider line
	 */
	public setDivider(divider = true) {
		this.data.divider = divider;
		return this;
	}

	/**
	 * Sets the spacing of this separator.
	 *
	 * @param spacing - The spacing to use
	 */
	public setSpacing(spacing: SeparatorSpacingSize) {
		this.data.spacing = spacing;
		return this;
	}

	/**
	 * Clears the spacing of this separator.
	 */
	public clearSpacing() {
		this.data.spacing = undefined;
		return this;
	}

	/**
	 * {@inheritDoc ComponentBuilder.toJSON}
	 */
	public override toJSON(): APISeparatorComponent {
		const clone = structuredClone(this.data);
		validate(separatorPredicate, clone);

		return clone as APISeparatorComponent;
	}
}
