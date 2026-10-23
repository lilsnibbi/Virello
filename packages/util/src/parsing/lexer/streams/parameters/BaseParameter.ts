/** Parameter with its original leading separators. */
export abstract class BaseParameter {
	/** Separator tokens that appeared before this parameter. */
	public readonly separators: readonly string[];

	/**
	 * Keep the leading separator tokens.
	 * @param separators - Separators before this parameter.
	 */
	public constructor(separators: readonly string[]) {
		this.separators = separators;
	}

	/** Leading separators joined into their original text. */
	public get leading(): string {
		return this.separators.join("");
	}

	/** Original parameter text, including quote delimiters when present but excluding leading separators. */
	public abstract get raw(): string;
}
