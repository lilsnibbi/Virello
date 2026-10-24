import { type } from "arktype";
import { assignmentSchema } from "../authority";
import { ShardError } from "../types";

export const restRequestSchema = type({
	assignment: assignmentSchema,
	operationId: "string >= 1 & string <= 128",
	"executionKey?": "string >= 1 & string <= 256",
	deadlineMs: "number.integer > 0 & number <= 300000",
	method: "'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'",
	path: "string >= 1 & string <= 8192",
	"body?": "unknown",
	"reason?": "string >= 1 & string <= 1024",
	"files?": type({
		name: "string >= 1 & string <= 256",
		data: "string",
	}).array(),
	auth: "boolean",
	"+": "reject",
});
export const restResponseSchema = type({ ok: "true", value: "unknown" }).or({
	ok: "false",
	code: "string",
	message: "string",
	operationId: "string",
	"status?": "number",
	"body?": "unknown",
});
export const restPayloadLimit = 16 * 1024 * 1024;
/** Bounded UTF-8 body reader, also applied when a peer omits Content-Length. */
export async function readBody(
	stream: ReadableStream<Uint8Array> | null,
	maximum = restPayloadLimit,
	reserve?: (bytes: number) => void,
	signal?: AbortSignal,
): Promise<string> {
	if (!stream) return "";
	const reader = stream.getReader();
	const abort = () => {
		void reader.cancel(signal?.reason).catch(() => {});
	};
	signal?.addEventListener("abort", abort, { once: true });
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			signal?.throwIfAborted();
			const part = await reader.read();
			signal?.throwIfAborted();
			if (part.done) break;
			size += part.value.byteLength;
			if (size > maximum)
				throw new ShardError(
					"PAYLOAD",
					"Fleet REST payload exceeds the byte limit.",
				);
			reserve?.(part.value.byteLength);
			chunks.push(part.value);
		}
		return Buffer.concat(chunks).toString("utf8");
	} catch (error) {
		await reader.cancel().catch(() => {});
		throw error;
	} finally {
		signal?.removeEventListener("abort", abort);
		reader.releaseLock();
	}
}
