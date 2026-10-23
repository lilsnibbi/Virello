import type { WordToken } from "../raw/TokenStream";
import { BaseParameter } from "./BaseParameter";

/** Unquoted parameter with its leading separators. */
export class WordParameter extends BaseParameter {
	/** Word text without leading separators. */
	public readonly value: string;

	/**
	 * Wrap an unquoted token.
	 * @param separators - Leading separators.
	 * @param part - Word token value.
	 */
	public constructor(
		separators: readonly string[],
		part: Omit<WordToken, "type">,
	) {
		super(separators);
		this.value = part.value;
	}

	/** Original unquoted word text. */
	public get raw() {
		return this.value;
	}
}
