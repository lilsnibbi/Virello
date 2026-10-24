import { ComponentType } from "discord-api-types/v10";
import { z } from "zod";
import { customIdPredicate, idPredicate } from "../../Assertions";

export const choiceOptionPredicate = z.object({
	value: z.string().min(1).max(100),
	label: z.string().min(1).max(100),
	description: z.string().min(1).max(100).optional(),
	default: z.boolean().optional(),
});

const uniqueOptions = (value: { options: { value: string }[] }) =>
	new Set(value.options.map((option) => option.value)).size ===
	value.options.length;

export const radioGroupPredicate = z
	.object({
		type: z.literal(ComponentType.RadioGroup),
		id: idPredicate,
		custom_id: customIdPredicate,
		options: choiceOptionPredicate.array().min(2).max(10),
		required: z.boolean().optional(),
	})
	.refine(uniqueOptions, { message: "Radio option values must be unique." })
	.refine(
		(value) => value.options.filter((option) => option.default).length <= 1,
		{
			message: "Radio groups support at most one default option.",
		},
	);

export const checkboxGroupPredicate = z
	.object({
		type: z.literal(ComponentType.CheckboxGroup),
		id: idPredicate,
		custom_id: customIdPredicate,
		options: choiceOptionPredicate.array().min(1).max(10),
		min_values: z.number().int().min(0).max(10).optional(),
		max_values: z.number().int().min(1).max(10).optional(),
		required: z.boolean().optional(),
	})
	.refine(uniqueOptions, { message: "Checkbox option values must be unique." })
	.refine(
		(value) =>
			(value.min_values ?? 1) <= (value.max_values ?? value.options.length) &&
			(value.max_values ?? value.options.length) <= value.options.length,
		{
			message:
				"Checkbox limits must satisfy min_values <= max_values <= option count.",
		},
	)
	.refine((value) => value.required === false || (value.min_values ?? 1) >= 1, {
		message: "Required checkbox groups must have min_values of at least one.",
	})
	.refine(
		(value) =>
			value.options.filter((option) => option.default).length <=
			(value.max_values ?? value.options.length),
		{
			message: "Checkbox defaults must not exceed max_values.",
		},
	);
