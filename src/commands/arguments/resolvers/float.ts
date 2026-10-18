import { Result } from "../../../utilities/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Parse with Number() and check optional inclusive bounds. NaN fails; this resolver does not require finiteness.
 * @param parameter - Input text.
 * @param options - Optional resolver settings.
 * @returns Number, or a parse/too-small/too-large identifier.
 */
export function resolveFloat(
	parameter: string,
	options?: {
		/** Inclusive minimum numeric value. Omit for no lower bound. */
		minimum?: number;
		/** Inclusive maximum numeric value. Omit for no upper bound. */
		maximum?: number;
	},
): Result<
	number,
	| Identifiers.ArgumentFloatError
	| Identifiers.ArgumentFloatTooSmall
	| Identifiers.ArgumentFloatTooLarge
> {
	const parsed = Number(parameter);

	if (Number.isNaN(parsed)) {
		return Result.err(Identifiers.ArgumentFloatError);
	}

	if (typeof options?.minimum === "number" && parsed < options.minimum) {
		return Result.err(Identifiers.ArgumentFloatTooSmall);
	}

	if (typeof options?.maximum === "number" && parsed > options.maximum) {
		return Result.err(Identifiers.ArgumentFloatTooLarge);
	}

	return Result.ok(parsed);
}
