import { record } from "@virello/util/runtime";
import type { $RestRequest } from "./RestClient";

function fieldName(key: string): void {
	if (
		typeof key !== "string" ||
		key.length > 64 ||
		!/^(?:[A-Za-z_][A-Za-z0-9_]*|files\[(?:0|[1-9]\d*)\])$/.test(key) ||
		["payload_json", "__proto__", "prototype", "constructor"].includes(key)
	)
		throw new TypeError("Invalid or reserved multipart field name.");
}

/** Validate and snapshot the same request before local queueing or fleet forwarding. */
export function prepareRequestBody(request: $RestRequest): {
	request: $RestRequest;
	body: string | FormData | undefined;
} {
	const snapshot = { ...request };
	const used = new Set<string>();
	if (request.form !== undefined) {
		if (request.body !== undefined)
			throw new TypeError("Specify body or form, not both.");
		if (
			!record(request.form) ||
			![Object.prototype, null].includes(Object.getPrototypeOf(request.form))
		)
			throw new TypeError(
				"Multipart form must be a plain record of text fields.",
			);
		snapshot.form = Object.fromEntries(
			Object.entries(request.form).map(([key, value]) => {
				fieldName(key);
				if (key.startsWith("files[") || typeof value !== "string")
					throw new TypeError(
						"Multipart form fields require text values and non-file field names.",
					);
				used.add(key);
				return [key, value];
			}),
		);
	}
	if (request.files !== undefined) {
		if (!Array.isArray(request.files))
			throw new TypeError("Multipart files must be an array.");
		snapshot.files = request.files.map((file, index) => {
			const { key, name, data } = file;
			const field = key === undefined ? `files[${index}]` : key;
			fieldName(field);
			if (used.has(field))
				throw new TypeError(
					"Multipart field names must be unique across text and files.",
				);
			used.add(field);
			if (
				typeof name !== "string" ||
				!name.length ||
				name.length > 256 ||
				/\p{Cc}/u.test(name) ||
				!(data instanceof Blob) ||
				data.type.length > 1024
			)
				throw new TypeError(
					"Uploads require a valid filename, Blob data and a bounded MIME type.",
				);
			return { name, data, ...(key === undefined ? {} : { key }) };
		});
	}
	const json =
		request.body === undefined ? undefined : JSON.stringify(request.body);
	if (request.body !== undefined) {
		if (json === undefined)
			throw new TypeError("REST body must be JSON-serializable.");
		// Keep attachment metadata consistent while a remote scheduler copies binary data.
		snapshot.body = JSON.parse(json);
	}
	let body: string | FormData | undefined = json;
	if (snapshot.form !== undefined || snapshot.files?.length) {
		const form = new FormData();
		if (snapshot.form !== undefined) {
			for (const [key, value] of Object.entries(snapshot.form))
				form.set(key, value);
		} else form.set("payload_json", json ?? "{}");
		snapshot.files?.forEach((file, index) =>
			form.set(file.key ?? `files[${index}]`, file.data, file.name),
		);
		body = form;
	}
	return { request: snapshot, body };
}
