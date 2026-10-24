import {
	ComponentType,
	type APIRadioGroupComponent,
	type APIRadioGroupOption,
} from "discord-api-types/v10";
import { normalizeArray, type RestOrArray } from "../../util/normalizeArray";
import { resolveBuilder } from "../../util/resolveBuilder";
import { validate } from "../../util/validation";
import { ComponentBuilder } from "../Component";
import { radioGroupPredicate } from "../choices/Assertions";
import { RadioGroupOptionBuilder } from "./RadioGroupOption";

type RadioOptionInput =
	| APIRadioGroupOption
	| RadioGroupOptionBuilder
	| ((builder: RadioGroupOptionBuilder) => RadioGroupOptionBuilder);

/** Single-choice modal control, placed inside a LabelBuilder. */
export class RadioGroupBuilder extends ComponentBuilder<APIRadioGroupComponent> {
	protected readonly data: Partial<Omit<APIRadioGroupComponent, "options">> & {
		options: RadioGroupOptionBuilder[];
	};
	public constructor(data: Partial<APIRadioGroupComponent> = {}) {
		super();
		const { options = [], ...rest } = data;
		this.data = {
			...structuredClone(rest),
			type: ComponentType.RadioGroup,
			options: options.map((option) => new RadioGroupOptionBuilder(option)),
		};
	}
	/** Options in display order. */
	public get options(): readonly RadioGroupOptionBuilder[] {
		return this.data.options;
	}
	/** Set the submitted field identifier. */
	public setCustomId(customId: string): this {
		this.data.custom_id = customId;
		return this;
	}
	/** Require a choice before submission. Defaults to true in Discord. */
	public setRequired(required = true): this {
		this.data.required = required;
		return this;
	}
	/** Append raw options, builders, or builder callbacks. */
	public addOptions(...options: RestOrArray<RadioOptionInput>): this {
		this.data.options.push(
			...normalizeArray(options).map((option) =>
				resolveBuilder(option, RadioGroupOptionBuilder),
			),
		);
		return this;
	}
	/** Replace all options. */
	public setOptions(...options: RestOrArray<RadioOptionInput>): this {
		return this.spliceOptions(
			0,
			this.options.length,
			...normalizeArray(options),
		);
	}
	/** Remove, insert or replace options in display order. */
	public spliceOptions(
		index: number,
		deleteCount: number,
		...options: RadioOptionInput[]
	): this {
		this.data.options.splice(
			index,
			deleteCount,
			...options.map((option) =>
				resolveBuilder(option, RadioGroupOptionBuilder),
			),
		);
		return this;
	}
	public override toJSON(): APIRadioGroupComponent {
		const { options, ...rest } = this.data;
		const data = {
			...structuredClone(rest),
			options: options.map((option) => option.toJSON()),
		};
		validate(radioGroupPredicate, data);
		return data as APIRadioGroupComponent;
	}
}
