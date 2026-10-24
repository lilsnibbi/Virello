import type { Parameter } from "../lexer/streams/ParameterStream";
import { ParserResult } from "./ParserResult";
import { EmptyStrategy } from "./strategies/EmptyStrategy";
import type { IUnorderedStrategy } from "./strategies/IUnorderedStrategy";

/** Split parameters into positional values, flags, and named options. */
export class Parser {
	/** Current strategy used for newly parsed results. */
	public strategy: IUnorderedStrategy;

	/**
	 * Create a parameter parser.
	 * @param strategy - Flag/option recognizer. Defaults to EmptyStrategy, which leaves every parameter positional.
	 */
	public constructor(strategy?: IUnorderedStrategy) {
		this.strategy = strategy ?? new EmptyStrategy();
	}

	/**
	 * Replace the flag/option recognizer for future runs.
	 * @param strategy - New recognizer.
	 * @returns This parser.
	 */
	public setUnorderedStrategy(strategy: IUnorderedStrategy) {
		this.strategy = strategy;
		return this;
	}

	/**
	 * Parse parameters into a new result using the current strategy.
	 * @param input - Parameter iterable.
	 * @returns Positional values, unique flags, and option value lists.
	 */
	public run(input: Iterable<Parameter>): ParserResult {
		return new ParserResult(this).parse(input);
	}
}
