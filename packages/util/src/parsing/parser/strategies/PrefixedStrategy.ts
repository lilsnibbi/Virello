import { Option } from "../../../result/index";
import type { IUnorderedStrategy } from "./IUnorderedStrategy";

/** Recognize prefixed flags and key/value options with literal separators. */
export class PrefixedStrategy implements IUnorderedStrategy {
	/** Accepted prefixes, tried in array order. Longer overlapping prefixes should come first. */
	public readonly prefixes: readonly string[];
	/** Accepted key/value separators, tried in array order. */
	public readonly separators: readonly string[];

	/**
	 * Choose the literal prefixes and option separators.
	 * @param prefixes - Prefixes such as -- or -.
	 * @param separators - Separators such as = or :.
	 */
	public constructor(
		prefixes: readonly string[],
		separators: readonly string[],
	) {
		this.prefixes = prefixes;
		this.separators = separators;
	}

	/**
	 * Match a prefix and no option separator after it.
	 * @param input - Parameter text.
	 * @returns Some with the name after the prefix, or None.
	 */
	public matchFlag(input: string): Option<string> {
		const prefix = this.prefixes.find((x) => input.startsWith(x));

		// If the prefix is missing, return None:
		if (!prefix) return Option.none;

		// If the separator is present, return None:
		if (this.separators.some((x) => input.includes(x, prefix.length)))
			return Option.none;

		return Option.some(input.slice(prefix.length));
	}

	/**
	 * Match a prefixed name followed by a configured separator and nonempty value.
	 * @param input - Parameter text.
	 * @returns Some([key, value]) without prefix/separator, or None.
	 */
	public matchOption(
		input: string,
	): Option<readonly [key: string, value: string]> {
		const prefix = this.prefixes.find((x) => input.startsWith(x));

		// If the prefix is missing, return None:
		if (!prefix) return Option.none;

		for (const separator of this.separators) {
			const index = input.indexOf(separator, prefix.length + 1);

			// If the separator is missing, skip:
			if (index === -1) continue;

			// If the separator is present, but has no value, return None:
			if (index + separator.length === input.length) return Option.none;

			const key = input.slice(prefix.length, index);
			const value = input.slice(index + separator.length);
			return Option.some([key, value] as const);
		}

		return Option.none;
	}
}
