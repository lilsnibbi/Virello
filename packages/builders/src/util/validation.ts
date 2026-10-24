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
