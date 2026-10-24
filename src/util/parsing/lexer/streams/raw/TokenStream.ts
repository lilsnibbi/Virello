import type { Lexer } from "../../Lexer";

/** Stateful lazy stream of raw tokens. Iterating again continues from the current input position. */
export class TokenStream implements Iterable<Token> {
	private readonly input: string;
	private readonly quotes: readonly [string, string][];
	private readonly separator: string;
	private position = 0;

	/**
	 * Create a tokenizer over input text.
	 * @param lexer - Separator and quote rules.
	 * @param input - Text to tokenize.
	 */
	public constructor(lexer: Lexer, input: string) {
		this.quotes = lexer.quotes;
		this.separator = lexer.separator;
		this.input = input;
	}

	/** Whether the input cursor has reached the end. */
	public get finished() {
		return this.position >= this.input.length;
	}

	/** Yield separators, matched quoted groups, and words while advancing the shared cursor. */
	public *[Symbol.iterator](): Iterator<Token> {
		while (!this.finished) {
			yield this.getPossibleSeparator() ??
				this.getPossibleQuotedArgument() ??
				this.getParameter();
		}
	}

	private getPossibleSeparator(): SeparatorToken | null {
		if (this.input.startsWith(this.separator, this.position)) {
			this.position += this.separator.length;
			return { type: TokenType.Separator, value: this.separator };
		}

		return null;
	}

	private getPossibleQuotedArgument(): QuotedToken | null {
		for (const [open, close] of this.quotes) {
			if (!this.input.startsWith(open, this.position)) continue;

			const end = this.input.indexOf(close, this.position + open.length);
			if (end === -1) continue;

			const value = this.input.slice(this.position + open.length, end);
			this.position = end + close.length;

			return { type: TokenType.Quoted, value, open, close };
		}

		return null;
	}

	private getParameter(): WordToken {
		const index = this.input.indexOf(this.separator, this.position);
		const value =
			index === -1
				? this.input.slice(this.position)
				: this.input.slice(this.position, index);
		this.position += value.length;
		return { type: TokenType.Parameter, value };
	}
}

/** Raw token categories. */
export enum TokenType {
	/** Unquoted word text. */
	Parameter,
	/** Text enclosed by a configured quote pair. */
	Quoted,
	/** One configured literal separator. */
	Separator,
}

/** Word, quoted-group, or separator token. */
export type Token = WordToken | QuotedToken | SeparatorToken;

/** One unquoted word token. */
export interface WordToken {
	/** Marks an unquoted parameter. */
	readonly type: TokenType.Parameter;
	/** Word text without separators. */
	readonly value: string;
}

/** One quoted group with its delimiters preserved separately. */
export interface QuotedToken {
	/** Marks a quoted parameter. */
	readonly type: TokenType.Quoted;
	/** Text between the quote delimiters. */
	readonly value: string;
	/** Opening quote delimiter. */
	readonly open: string;
	/** Closing quote delimiter. */
	readonly close: string;
}

/** One occurrence of the configured separator. */
export interface SeparatorToken {
	/** Marks a separator token. */
	readonly type: TokenType.Separator;
	/** Literal separator text. */
	readonly value: string;
}
