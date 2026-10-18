import { URL } from "node:url";
import { Result } from "../../../utilities/result/index";
import { Identifiers } from "../../errors/Identifiers";

/**
 * Parse an absolute URL with the URL constructor.
 * @param parameter - URL text.
 * @returns A URL object, or ArgumentHyperlinkError when parsing fails.
 */
export function resolveHyperlink(
	parameter: string,
): Result<URL, Identifiers.ArgumentHyperlinkError> {
	const result = Result.from(() => new URL(parameter));
	return result.mapErr(() => Identifiers.ArgumentHyperlinkError) as Result<
		URL,
		Identifiers.ArgumentHyperlinkError
	>;
}
