import type { QuotedToken } from "../raw/TokenStream";
import { BaseParameter } from "./BaseParameter";

/** Quoted parameter with its value and original delimiters. */
export class QuotedParameter extends BaseParameter {
	/** Text inside the quotes. */
	public readonly value: string;
	/** Opening quote text. */
	public readonly open: string;
	/** Closing quote text. */
	public readonly close: string;

	/**
	 * Wrap a quoted token.
	 * @param separators - Leading separators.
	 * @param part - Inner text and quote delimiters.
	 */
	public constructor(
		separators: readonly string[],
		part: Omit<QuotedToken, "type">,
	) {
		super(separators);
		this.value = part.value;
		this.open = part.open;
		this.close = part.close;
	}

	/** Original quoted text, reconstructed with both delimiters. */
	public get raw() {
		return `${this.open}${this.value}${this.close}`;
	}
}
