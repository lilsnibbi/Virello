// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import { Locale } from "discord-api-types/v10";
import { z } from "zod";

export const idPredicate = z
	.number()
	.int()
	.min(0)
	.max(4_294_967_295)
	.optional();
export const customIdPredicate = z.string().min(1).max(100);
export const snowflakePredicate = z.string().regex(/^(?:0|[1-9]\d*)$/);

export const memberPermissionsPredicate = z.string().regex(/^\d+$/).nullable();

export const localeMapPredicate = z
	.strictObject(
		Object.fromEntries(
			Object.values(Locale).map((loc) => [loc, z.string().optional()]),
		) as Record<Locale, z.ZodOptional<z.ZodString>>,
	)
	.nullable();
