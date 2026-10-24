import {
	ComponentType,
	type APICheckboxGroupComponent,
	type APICheckboxGroupOption,
} from "discord-api-types/v10";
import { normalizeArray, type RestOrArray } from "../../util/normalizeArray";
import { resolveBuilder } from "../../util/resolveBuilder";
import { validate } from "../../util/validation";
import { ComponentBuilder } from "../Component";
import { checkboxGroupPredicate } from "../choices/Assertions";
import { CheckboxGroupOptionBuilder } from "./CheckboxGroupOption";

type CheckboxOptionInput =
	| APICheckboxGroupOption
	| CheckboxGroupOptionBuilder
	| ((builder: CheckboxGroupOptionBuilder) => CheckboxGroupOptionBuilder);

/** Multiple-choice modal control, placed inside a LabelBuilder. */
export class CheckboxGroupBuilder extends ComponentBuilder<APICheckboxGroupComponent> {
	protected readonly data: Partial<
		Omit<APICheckboxGroupComponent, "options">
	> & { options: CheckboxGroupOptionBuilder[] };
	public constructor(data: Partial<APICheckboxGroupComponent> = {}) {
		super();
		const { options = [], ...rest } = data;
		this.data = {
			...structuredClone(rest),
			type: ComponentType.CheckboxGroup,
			options: options.map((option) => new CheckboxGroupOptionBuilder(option)),
		};
	}
	/** Options in display order. */
	public get options(): readonly CheckboxGroupOptionBuilder[] {
		return this.data.options;
	}
	/** Set the submitted field identifier. */
	public setCustomId(customId: string): this {
		this.data.custom_id = customId;
		return this;
	}
	/** Require selections before submission. Defaults to true in Discord. */
	public setRequired(required = true): this {
		this.data.required = required;
		return this;
	}
	/** Set the minimum selected options, from zero to ten. */
	public setMinValues(minValues: number): this {
		this.data.min_values = minValues;
		return this;
	}
	/** Restore Discord's minimum selection default. */
	public clearMinValues(): this {
		this.data.min_values = undefined;
		return this;
	}
	/** Set the maximum selected options, from one to ten. */
	public setMaxValues(maxValues: number): this {
		this.data.max_values = maxValues;
		return this;
	}
	/** Default the maximum to the option count. */
	public clearMaxValues(): this {
		this.data.max_values = undefined;
		return this;
	}
	/** Append raw options, builders, or builder callbacks. */
	public addOptions(...options: RestOrArray<CheckboxOptionInput>): this {
		this.data.options.push(
			...normalizeArray(options).map((option) =>
				resolveBuilder(option, CheckboxGroupOptionBuilder),
			),
		);
		return this;
	}
	/** Replace all options. */
	public setOptions(...options: RestOrArray<CheckboxOptionInput>): this {
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
		...options: CheckboxOptionInput[]
	): this {
		this.data.options.splice(
			index,
			deleteCount,
			...options.map((option) =>
				resolveBuilder(option, CheckboxGroupOptionBuilder),
			),
		);
		return this;
	}
	public override toJSON(): APICheckboxGroupComponent {
		const { options, ...rest } = this.data;
		const data = {
			...structuredClone(rest),
			options: options.map((option) => option.toJSON()),
		};
		validate(checkboxGroupPredicate, data);
		return data as APICheckboxGroupComponent;
	}
}
