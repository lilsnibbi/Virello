import type { APIRadioGroupOption } from "discord-api-types/v10";
import type { JSONEncodable } from "../../util/jsonEncodable";
import { validate } from "../../util/validation";
import { choiceOptionPredicate } from "./Assertions";

/** Shared fields of Discord radio and checkbox options. @internal */
export class ChoiceOptionBuilder implements JSONEncodable<APIRadioGroupOption> {
	private readonly data: Partial<APIRadioGroupOption>;
	public constructor(data: Partial<APIRadioGroupOption> = {}) {
		this.data = structuredClone(data);
	}
	/** Set the displayed option label. */
	public setLabel(label: string): this {
		this.data.label = label;
		return this;
	}
	/** Set the value returned with the modal submission. */
	public setValue(value: string): this {
		this.data.value = value;
		return this;
	}
	/** Set an optional description. */
	public setDescription(description: string): this {
		this.data.description = description;
		return this;
	}
	/** Remove the description. */
	public clearDescription(): this {
		this.data.description = undefined;
		return this;
	}
	/** Select this option by default. */
	public setDefault(isDefault = true): this {
		this.data.default = isDefault;
		return this;
	}
	/** Serialize an independent, validated option. */
	public toJSON(): APIRadioGroupOption {
		const data = structuredClone(this.data);
		validate(choiceOptionPredicate, data);
		return data as APIRadioGroupOption;
	}
}
