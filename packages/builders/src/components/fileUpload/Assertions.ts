// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
import { ComponentType } from "discord-api-types/v10";
import { z } from "zod";
import { customIdPredicate, idPredicate } from "../../Assertions";

export const fileUploadPredicate = z
	.object({
		type: z.literal(ComponentType.FileUpload),
		id: idPredicate,
		custom_id: customIdPredicate,
		min_values: z.number().int().min(0).max(10).optional(),
		max_values: z.number().int().min(1).max(10).optional(),
		required: z.boolean().optional(),
	})
	.refine((value) => (value.min_values ?? 1) <= (value.max_values ?? 1), {
		message: "File upload min_values must not exceed max_values.",
	})
	.refine((value) => value.required === false || (value.min_values ?? 1) >= 1, {
		message: "Required file uploads must have min_values of at least one.",
	});
