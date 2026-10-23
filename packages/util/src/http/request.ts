import { HttpError } from "./HttpError";

/** Successful response formats supported by request. */
export type ResponseFormat = "json" | "text" | "bytes" | "blob" | "response";
/** Native fetch options with an optional JSON body and response format. */
export type HttpRequestOptions = RequestInit & {
	/** JSON-serializable request body. Cannot be supplied together with body; sets Content-Type unless already set. */
	json?: unknown;
	/** Successful response format. Defaults to json. */
	response?: ResponseFormat;
};
/**
 * Fetch a URL and decode its successful response in the selected format.
 * @param url - Request URL.
 * @param options - Native fetch settings, optional JSON body, and response format.
 * @returns Decoded JSON/text/bytes/blob, or the original Response. JSON mode returns undefined for HTTP 204/205.
 * @throws HttpError with the saved text body for non-2xx responses; invalid JSON/body settings, cancellation, and
 * fetch/decoding failures propagate.
 */
export function request<T = unknown>(
	url: URL | string,
	options?: HttpRequestOptions & {
		/** Select the overload’s decoded response type. */
		response?: "json";
	},
): Promise<T>;
/**
 * Fetch a URL and decode its successful response in the selected format.
 * @param url - Request URL.
 * @param options - Native fetch settings, optional JSON body, and response format.
 * @returns Decoded JSON/text/bytes/blob, or the original Response. JSON mode returns undefined for HTTP 204/205.
 * @throws HttpError with the saved text body for non-2xx responses; invalid JSON/body settings, cancellation, and
 * fetch/decoding failures propagate.
 */
export function request(
	url: URL | string,
	options: HttpRequestOptions & {
		/** Select the overload’s decoded response type. */
		response: "text";
	},
): Promise<string>;
/**
 * Fetch a URL and decode its successful response in the selected format.
 * @param url - Request URL.
 * @param options - Native fetch settings, optional JSON body, and response format.
 * @returns Decoded JSON/text/bytes/blob, or the original Response. JSON mode returns undefined for HTTP 204/205.
 * @throws HttpError with the saved text body for non-2xx responses; invalid JSON/body settings, cancellation, and
 * fetch/decoding failures propagate.
 */
export function request(
	url: URL | string,
	options: HttpRequestOptions & {
		/** Select the overload’s decoded response type. */
		response: "bytes";
	},
): Promise<Uint8Array>;
/**
 * Fetch a URL and decode its successful response in the selected format.
 * @param url - Request URL.
 * @param options - Native fetch settings, optional JSON body, and response format.
 * @returns Decoded JSON/text/bytes/blob, or the original Response. JSON mode returns undefined for HTTP 204/205.
 * @throws HttpError with the saved text body for non-2xx responses; invalid JSON/body settings, cancellation, and
 * fetch/decoding failures propagate.
 */
export function request(
	url: URL | string,
	options: HttpRequestOptions & {
		/** Select the overload’s decoded response type. */
		response: "blob";
	},
): Promise<Blob>;
/**
 * Fetch a URL and decode its successful response in the selected format.
 * @param url - Request URL.
 * @param options - Native fetch settings, optional JSON body, and response format.
 * @returns Decoded JSON/text/bytes/blob, or the original Response. JSON mode returns undefined for HTTP 204/205.
 * @throws HttpError with the saved text body for non-2xx responses; invalid JSON/body settings, cancellation, and
 * fetch/decoding failures propagate.
 */
export function request(
	url: URL | string,
	options: HttpRequestOptions & {
		/** Select the overload’s decoded response type. */
		response: "response";
	},
): Promise<Response>;
/**
 * Fetch a URL and decode its successful response in the selected format.
 * @param url - Request URL.
 * @param options - Native fetch settings, optional JSON body, and response format.
 * @returns Decoded JSON/text/bytes/blob, or the original Response. JSON mode returns undefined for HTTP 204/205.
 * @throws HttpError with the saved text body for non-2xx responses; invalid JSON/body settings, cancellation, and
 * fetch/decoding failures propagate.
 */
export async function request(
	url: URL | string,
	options: HttpRequestOptions = {},
): Promise<unknown> {
	const { response = "json", json, ...init } = options;
	if (!["json", "text", "bytes", "blob", "response"].includes(response))
		throw new TypeError(`Unknown response format "${response}".`);
	if ("json" in options) {
		if ("body" in options)
			throw new TypeError("Use either json or body, not both.");
		init.body = JSON.stringify(json);
		if (init.body === undefined)
			throw new TypeError("The JSON body is not serializable.");
		const headers = new Headers(init.headers);
		if (!headers.has("content-type"))
			headers.set("content-type", "application/json");
		init.headers = headers;
	}
	const result = await fetch(url, init);
	if (!result.ok)
		throw new HttpError(
			String(url),
			result.status,
			result,
			await result.text(),
		);
	switch (response) {
		case "response":
			return result;
		case "text":
			return result.text();
		case "bytes":
			return result.bytes();
		case "blob":
			return result.blob();
		default:
			return result.status === 204 || result.status === 205
				? undefined
				: result.json();
	}
}
