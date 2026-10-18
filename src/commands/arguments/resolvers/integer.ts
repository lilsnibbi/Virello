import { Result } from "../../../utilities/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Parse with Number(), require an integer, and check optional inclusive bounds.
 * @param parameter - Input text.
 * @param options - Optional resolver settings.
 * @returns Integer, or a parse/too-small/too-large identifier.
 */
export function resolveInteger(
	parameter: string,
	options?: {
		/** Inclusive minimum numeric value. Omit for no lower bound. */
		minimum?: number;
		/** Inclusive maximum numeric value. Omit for no upper bound. */
		maximum?: number;
	},
): Result<
	number,
	| Identifiers.ArgumentIntegerError
	| Identifiers.ArgumentIntegerTooSmall
	| Identifiers.ArgumentIntegerTooLarge
> {
	const parsed = Number(parameter);

	if (!Number.isInteger(parsed)) {
		return Result.err(Identifiers.ArgumentIntegerError);
	}

	if (typeof options?.minimum === "number" && parsed < options.minimum) {
		return Result.err(Identifiers.ArgumentIntegerTooSmall);
	}

	if (typeof options?.maximum === "number" && parsed > options.maximum) {
		return Result.err(Identifiers.ArgumentIntegerTooLarge);
	}

	return Result.ok(parsed);
}
