import { ParameterStream } from "./streams/ParameterStream";
import { TokenStream } from "./streams/raw/TokenStream";

/** Split text into raw tokens or parameters while retaining separators and matched quote pairs. */
export class Lexer {
	/** Opening/closing quote pairs recognized at token boundaries, in configured order. */
	public readonly quotes: readonly [open: string, close: string][];
	/** Literal parameter separator. Defaults to one space; use a nonempty string. */
	public readonly separator: string;

	/**
	 * Configure text tokenization.
	 * @param options - Separator and quote pairs. Defaults to a space separator and no quoted groups.
	 */
	public constructor(options: Lexer.Options = {}) {
		this.quotes = options.quotes ?? [];
		this.separator = options.separator ?? " ";
	}

	/**
	 * Create a parameter stream, grouping each token with its leading separators.
	 * @param input - Text to tokenize.
	 * @returns A lazily consumed ParameterStream.
	 */
	public run(input: string) {
		return new ParameterStream(this.raw(input));
	}

	/**
	 * Create a raw stream of word, quoted, and separator tokens.
	 * @param input - Text to tokenize.
	 * @returns A lazily consumed TokenStream.
	 */
	public raw(input: string) {
		return new TokenStream(this, input);
	}
}

/** Types and helpers for {@link Lexer}. */
export declare namespace Lexer {
	/** Literal tokenization settings. */
	export interface Options {
		/** Nonempty literal delimiter. Defaults to one space. */
		separator?: string;
		/** Opening/closing quote pairs. Defaults to an empty list. Unclosed quote text remains a word. */
		quotes?: readonly [open: string, close: string][];
	}
}
