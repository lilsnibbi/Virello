// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import {
	type APIButtonComponentWithCustomId,
	ButtonStyle,
	ComponentType,
} from "discord-api-types/v10";
import { Mixin } from "ts-mixer";
import { BaseButtonBuilder } from "./Button";
import { EmojiOrLabelButtonMixin } from "./mixins/EmojiOrLabelButtonMixin";

export type CustomIdButtonStyle = APIButtonComponentWithCustomId["style"];

/**
 * A builder that creates API-compatible JSON data for buttons with custom IDs.
 *
 * @mixes {@link BaseButtonBuilder}\<{@link discord-api-types/v10#(APIButtonComponentWithCustomId:interface)}\>
 * @mixes {@link EmojiOrLabelButtonMixin}
 */

export abstract class CustomIdButtonBuilder extends Mixin(
	BaseButtonBuilder<APIButtonComponentWithCustomId>,
	EmojiOrLabelButtonMixin,
) {
	protected override readonly data: Partial<APIButtonComponentWithCustomId>;

	protected constructor(data: Partial<APIButtonComponentWithCustomId> = {}) {
		super();
		this.data = { ...structuredClone(data), type: ComponentType.Button };
	}

	/**
	 * Sets the custom id for this button.
	 *
	 * @remarks
	 * This method is only applicable to buttons that are not using the `Link` button style.
	 * @param customId - The custom id to use
	 */
	public setCustomId(customId: string) {
		this.data.custom_id = customId;
		return this;
	}
}

/**
 * A builder that creates API-compatible JSON data for buttons with custom IDs (using the primary style).
 */
export class PrimaryButtonBuilder extends CustomIdButtonBuilder {
	public constructor(data: Partial<APIButtonComponentWithCustomId> = {}) {
		super({ ...data, style: ButtonStyle.Primary });
	}
}

/**
 * A builder that creates API-compatible JSON data for buttons with custom IDs (using the secondary style).
 */
export class SecondaryButtonBuilder extends CustomIdButtonBuilder {
	public constructor(data: Partial<APIButtonComponentWithCustomId> = {}) {
		super({ ...data, style: ButtonStyle.Secondary });
	}
}

/**
 * A builder that creates API-compatible JSON data for buttons with custom IDs (using the success style).
 */
export class SuccessButtonBuilder extends CustomIdButtonBuilder {
	public constructor(data: Partial<APIButtonComponentWithCustomId> = {}) {
		super({ ...data, style: ButtonStyle.Success });
	}
}

/**
 * A builder that creates API-compatible JSON data for buttons with custom IDs (using the danger style).
 */
export class DangerButtonBuilder extends CustomIdButtonBuilder {
	public constructor(data: Partial<APIButtonComponentWithCustomId> = {}) {
		super({ ...data, style: ButtonStyle.Danger });
	}
}
