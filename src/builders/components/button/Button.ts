// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import type { APIButtonComponent } from "discord-api-types/v10";
import { validate } from "../../util/validation";
import { buttonPredicate } from "../Assertions";
import { ComponentBuilder } from "../Component";

/**
 * A builder that creates API-compatible JSON data for buttons.
 */
export abstract class BaseButtonBuilder<
	ButtonData extends APIButtonComponent,
> extends ComponentBuilder<ButtonData> {
	/**
	 * @internal
	 */
	declare protected readonly data: Partial<ButtonData>;

	/**
	 * Sets whether this button is disabled.
	 *
	 * @param disabled - Whether to disable this button
	 */
	public setDisabled(disabled = true) {
		this.data.disabled = disabled;
		return this;
	}

	/**
	 * {@inheritDoc ComponentBuilder.toJSON}
	 */
	public override toJSON(): ButtonData {
		const clone = structuredClone(this.data);
		validate(buttonPredicate, clone);

		return clone as ButtonData;
	}
}
