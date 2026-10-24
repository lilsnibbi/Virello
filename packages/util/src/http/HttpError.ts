/** A non-successful HTTP response. The body is consumed once and retained as text. */
export class HttpError extends Error {
	/** HttpError error name. */
	override name = "HttpError";
	/**
	 * Retain a failed response and its consumed text body.
	 * @param url - Requested URL.
	 * @param status - HTTP response status.
	 * @param response - Original response; its body has already been read.
	 * @param body - Saved response text.
	 */
	constructor(
		/** Requested URL. */
		readonly url: string,
		/** HTTP response status code. */
		readonly status: number,
		/** Original response with its body already consumed. */
		readonly response: Response,
		/** Saved text body from the failed response. */
		readonly body: string,
	) {
		super(`Request to "${url}" failed with HTTP ${status}.`);
	}
	/** Parse the saved body as JSON. */
	json(): unknown {
		return JSON.parse(this.body);
	}
}
