import { QuotedParameter } from "./parameters/QuotedParameter";
import { WordParameter } from "./parameters/WordParameter";
import { type Token, TokenType } from "./raw/TokenStream";

/** Group raw tokens into parameters with their leading separators. */
export class ParameterStream {
	private readonly stream: Iterable<Token>;
	private separators: string[] = [];

	/**
	 * Wrap a raw token iterable.
	 * @param stream - Tokens supplied by a lexer.
	 */
	public constructor(stream: Iterable<Token>) {
		this.stream = stream;
	}

	/** Yield word/quoted parameters. The iterator’s final return value contains any trailing separators. */
	public *[Symbol.iterator](): Iterator<Parameter, string[]> {
		for (const part of this.stream) {
			if (part.type === TokenType.Separator) {
				this.separators.push(part.value);
				continue;
			}

			yield part.type === TokenType.Quoted
				? new QuotedParameter(this.separators, part)
				: new WordParameter(this.separators, part);
			this.separators = [];
		}

		return this.separators;
	}
}

/** Quoted or unquoted parameter with its raw text and leading separators. */
export type Parameter = QuotedParameter | WordParameter;
