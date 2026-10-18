import { Result } from "../../../utilities/result/index";
import { Identifiers } from "../../errors/Identifiers";

const baseTruths = ["1", "true", "+", "t", "yes", "y"] as const;
const baseFalses = ["0", "false", "-", "f", "no", "n"] as const;

/**
 * Parse a built-in true/false spelling, plus any custom spellings. Input is lowercased before comparison.
 * @param parameter - Input text.
 * @param customs - Optional additional lowercase spellings.
 * @returns Boolean value, or ArgumentBooleanError.
 */
export function resolveBoolean(
	parameter: string,
	customs?: {
		/** Additional lowercase true spellings. Built-ins are 1, true, +, t, yes, and y. */
		truths?: readonly string[];
		/** Additional lowercase false spellings. Built-ins are 0, false, -, f, no, and n. */
		falses?: readonly string[];
	},
): Result<boolean, Identifiers.ArgumentBooleanError> {
	const boolean = parameter.toLowerCase();

	if ([...baseTruths, ...(customs?.truths ?? [])].includes(boolean)) {
		return Result.ok(true);
	}

	if ([...baseFalses, ...(customs?.falses ?? [])].includes(boolean)) {
		return Result.ok(false);
	}

	return Result.err(Identifiers.ArgumentBooleanError);
}
