import { Result } from "../../../utilities/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Accept the original text if its length is within the optional inclusive bounds.
 * @param parameter - Input text.
 * @param options - Optional resolver settings.
 * @returns Original text, or a too-short/too-long identifier.
 */
export function resolveString(
	parameter: string,
	options?: {
		/** Inclusive minimum string length. Omit for no lower bound. */
		minimum?: number;
		/** Inclusive maximum string length. Omit for no upper bound. */
		maximum?: number;
	},
): Result<
	string,
	Identifiers.ArgumentStringTooShort | Identifiers.ArgumentStringTooLong
> {
	if (
		typeof options?.minimum === "number" &&
		parameter.length < options.minimum
	) {
		return Result.err(Identifiers.ArgumentStringTooShort);
	}

	if (
		typeof options?.maximum === "number" &&
		parameter.length > options.maximum
	) {
		return Result.err(Identifiers.ArgumentStringTooLong);
	}

	return Result.ok(parameter);
}
