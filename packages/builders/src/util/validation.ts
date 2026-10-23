// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: serialization always validates; no global bypass.
// See NOTICE and LICENSE at the root of @virello/builders.
import type { z } from "zod";
import { ValidationError } from "./ValidationError";

/** Validate without replacing the native payload with Zod's parsed copy. */
export function validate<Validator extends z.ZodType>(
	validator: Validator,
	value: unknown,
): void {
	const result = validator.safeParse(value);
	if (!result.success) throw new ValidationError(result.error);
}
