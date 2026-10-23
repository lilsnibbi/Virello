// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See NOTICE and LICENSE at the root of @virello/builders.
import type { z } from "zod";

/**
 * An error that is thrown when validation fails.
 */
export class ValidationError extends Error {
	/**
	 * The underlying cause of the validation error.
	 */
	public override readonly cause: z.ZodError;

	/**
	 * @internal
	 */
	public constructor(error: z.ZodError) {
		super(error.message);

		this.name = "ValidationError";
		this.cause = error;
	}
}
