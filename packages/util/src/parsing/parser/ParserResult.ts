import type { Parameter } from "../lexer/streams/ParameterStream";
import type { Parser } from "./Parser";
import type { IUnorderedStrategy } from "./strategies/IUnorderedStrategy";

/** Mutable parsed parameters grouped into positional values, flags, and options. */
export class ParserResult {
	/** Parameters that matched neither a flag nor an option, in input order. */
	public readonly ordered: Parameter[] = [];
	/** Unique flag names without their prefixes. */
	public readonly flags = new Set<string>();
	/** Option names mapped to all their values in input order. */
	public readonly options = new Map<string, string[]>();
	private readonly strategy: IUnorderedStrategy;

	/**
	 * Capture a parser’s current strategy.
	 * @param parser - Parser whose strategy recognizes flags and options.
	 */
	public constructor(parser: Parser) {
		this.strategy = parser.strategy;
	}

	/**
	 * Append parsed parameters to this result. Flags are checked before options; unrecognized values stay positional.
	 * @param parameters - Parameters to classify.
	 * @returns This result.
	 */
	public parse(parameters: Iterable<Parameter>) {
		for (const parameter of parameters) {
			this.parsePossibleFlag(parameter) ||
				this.parsePossibleOptions(parameter) ||
				this.parseOrdered(parameter);
		}

		return this;
	}

	private parsePossibleFlag(parameter: Parameter): boolean {
		return this.strategy
			.matchFlag(parameter.value)
			.inspect((value) => this.flags.add(value))
			.isSome();
	}

	private parsePossibleOptions(parameter: Parameter): boolean {
		return this.strategy
			.matchOption(parameter.value)
			.inspect(([key, value]) => {
				const existing = this.options.get(key);
				if (existing) existing.push(value);
				else this.options.set(key, [value]);
			})
			.isSome();
	}

	private parseOrdered(parameter: Parameter): boolean {
		this.ordered.push(parameter);
		return true;
	}
}
