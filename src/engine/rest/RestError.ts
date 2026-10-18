/** A failed HTTP response; paths never expose interaction or webhook tokens. */
export class RestError extends Error {
	/**
	 * Create an HTTP failure.
	 * @param status - Response status code.
	 * @param body - Parsed response body, or response text if error JSON could not be parsed.
	 */
	public constructor(
		/** Rejected HTTP response status. */
		public readonly status: number,
		/** Parsed error body, or its text when error JSON could not be parsed. */
		public readonly body: unknown,
	) {
		super(`Discord REST returned HTTP ${status}`);
		this.name = "RestError";
	}
}
