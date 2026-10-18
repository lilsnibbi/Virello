import { Result } from "../../../utilities/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Match a configured enum value, optionally ignoring case. The returned string preserves the input’s case.
 * @param parameter - Input text.
 * @param options - Optional resolver settings.
 * @returns Original text, or an empty-list/no-match identifier.
 */
export function resolveEnum(
	parameter: string,
	options?: {
		/** Allowed strings. An omitted or empty list fails. */
		enum?: string[];
		/** Ignore case when comparing values. Defaults to false. */
		caseInsensitive?: boolean;
	},
): Result<
	string,
	Identifiers.ArgumentEnumEmptyError | Identifiers.ArgumentEnumError
> {
	if (!options?.enum?.length) {
		return Result.err(Identifiers.ArgumentEnumEmptyError);
	}

	if (!options.caseInsensitive && !options.enum.includes(parameter)) {
		return Result.err(Identifiers.ArgumentEnumError);
	}

	if (
		options.caseInsensitive &&
		!options.enum.some((v) => v.toLowerCase() === parameter.toLowerCase())
	) {
		return Result.err(Identifiers.ArgumentEnumError);
	}

	return Result.ok(parameter);
}
