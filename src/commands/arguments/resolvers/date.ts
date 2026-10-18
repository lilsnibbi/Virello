import { Result } from "../../../utilities/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Parse text with new Date() and check optional inclusive timestamp bounds.
 * @param parameter - Input text.
 * @param options - Optional resolver settings.
 * @returns Date, or a parse/too-early/too-far identifier.
 */
export function resolveDate(
	parameter: string,
	options?: {
		/** Inclusive minimum Unix timestamp in milliseconds. Omit for no lower bound. */
		minimum?: number;
		/** Inclusive maximum Unix timestamp in milliseconds. Omit for no upper bound. */
		maximum?: number;
	},
): Result<
	Date,
	| Identifiers.ArgumentDateError
	| Identifiers.ArgumentDateTooEarly
	| Identifiers.ArgumentDateTooFar
> {
	const parsed = new Date(parameter);

	const time = parsed.getTime();

	if (Number.isNaN(time)) {
		return Result.err(Identifiers.ArgumentDateError);
	}

	if (typeof options?.minimum === "number" && time < options.minimum) {
		return Result.err(Identifiers.ArgumentDateTooEarly);
	}

	if (typeof options?.maximum === "number" && time > options.maximum) {
		return Result.err(Identifiers.ArgumentDateTooFar);
	}

	return Result.ok(parsed);
}
