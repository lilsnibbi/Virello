import { ComponentType, TextInputStyle } from "discord-api-types/v10";
import { z } from "zod";
import { customIdPredicate, idPredicate } from "../../Assertions";

export const textInputPredicate = z
	.object({
		id: idPredicate,
		type: z.literal(ComponentType.TextInput),
		custom_id: customIdPredicate,
		label: z.string().min(1).max(45).optional(),
		style: z.nativeEnum(TextInputStyle),
		min_length: z.number().int().min(0).max(4_000).optional(),
		max_length: z.number().int().min(1).max(4_000).optional(),
		placeholder: z.string().max(100).optional(),
		value: z.string().min(0).max(4_000).optional(),
		required: z.boolean().optional(),
	})
	.refine((value) => (value.min_length ?? 0) <= (value.max_length ?? 4_000), {
		message: "Text input min_length must not exceed max_length.",
	});
