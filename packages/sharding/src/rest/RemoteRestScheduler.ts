import type { $RestRequest, $RestScheduler } from "@virello/rest";
import { RestError } from "@virello/rest";
import { sameAssignment, type ShardAssignment } from "../authority";
import { ShardError } from "../types";
import { encode, loopback } from "../transport/protocol";
import { readBody, restPayloadLimit, restResponseSchema } from "./protocol";

/** HTTP has a separate queue/transport from lifecycle IPC and coordinator WebSockets. */
export class RemoteRestScheduler implements $RestScheduler {
	private current?: {
		assignment: ShardAssignment;
		url: string;
		capability: string;
	};
	private bytes = 0;
	private readonly requests = new Set<AbortController>();
	public configure(
		assignment: ShardAssignment,
		endpoint: { url: string; capability: string },
	): void {
		if (
			this.current &&
			sameAssignment(this.current.assignment, assignment) &&
			this.current.url === endpoint.url &&
			this.current.capability === endpoint.capability
		)
			return;
		const url = new URL(endpoint.url);
		if (
			!["https:", "http:"].includes(url.protocol) ||
			(url.protocol === "http:" && !loopback(url.hostname)) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash
		)
			throw new ShardError(
				"CONFIG",
				"Fleet REST requires an authenticated HTTPS endpoint, or loopback HTTP for development.",
			);
		this.current = { assignment, ...endpoint };
	}
	/** Revoke queued and running client waits. Submitted mutations may remain unknown at the scheduler. */
	public revoke(): void {
		this.current = undefined;
		for (const controller of this.requests)
			controller.abort(
				new ShardError("RELEASED", "Assignment effect admission closed."),
			);
	}
	public async request(request: $RestRequest): Promise<unknown> {
		const authority = this.current;
		if (!authority)
			throw new ShardError("UNASSIGNED", "No fleet REST authority is active.");
		if (this.requests.size >= 128)
			throw new ShardError(
				"OVERLOADED",
				"Fleet REST request capacity reached.",
			);
		const operationId = request.operationId ?? crypto.randomUUID();
		const controller = new AbortController();
		const signal = AbortSignal.any([
			controller.signal,
			AbortSignal.timeout(request.deadlineMs ?? 15000),
			...(request.signal ? [request.signal] : []),
		]);
		this.requests.add(controller);
		let reserved = 0;
		let submitted = false;
		let answered = false;
		const started = performance.now();
		try {
			const total = (request.files ?? []).reduce(
				(sum, file) => sum + file.data.size,
				0,
			);
			if (total > 8 * 1024 * 1024)
				throw new ShardError(
					"PAYLOAD",
					"Fleet REST attachments exceed 8 MiB; use a separately bounded upload service for larger files.",
				);
			// Reserve before copying Blobs or constructing base64 strings. Account for both representations.
			const estimate =
				total * 3 +
				Buffer.byteLength(encode(request.body ?? null, restPayloadLimit)) +
				16384;
			if (this.bytes + estimate > 64 * 1024 * 1024)
				throw new ShardError(
					"OVERLOADED",
					"Fleet REST queued byte capacity reached.",
				);
			reserved = estimate;
			this.bytes += reserved;
			const files = await Promise.all(
				(request.files ?? []).map(async (file) => ({
					name: file.name,
					data: Buffer.from(await file.data.arrayBuffer()).toString("base64"),
				})),
			);
			signal.throwIfAborted();
			if (this.current !== authority)
				throw new ShardError(
					"RELEASED",
					"REST authority changed while preparing the request.",
				);
			const deadlineMs = Math.floor(
				(request.deadlineMs ?? 15000) - (performance.now() - started),
			);
			if (deadlineMs <= 0)
				throw new ShardError(
					"TIMEOUT",
					"REST deadline elapsed before transmission.",
				);
			const body = encode(
				{
					assignment: authority.assignment,
					operationId,
					method: request.method,
					path: request.path,
					auth: request.auth !== false,
					deadlineMs,
					...(request.body === undefined ? {} : { body: request.body }),
					...(request.reason === undefined ? {} : { reason: request.reason }),
					...(request.executionKey
						? { executionKey: request.executionKey }
						: {}),
					...(files.length ? { files } : {}),
				},
				restPayloadLimit,
			);
			const extra = Math.max(0, Buffer.byteLength(body) - reserved);
			if (this.bytes + extra > 64 * 1024 * 1024)
				throw new ShardError(
					"OVERLOADED",
					"Fleet REST queued byte capacity reached.",
				);
			this.bytes += extra;
			reserved += extra;
			submitted = true;
			const response = await fetch(authority.url, {
				method: "POST",
				headers: {
					authorization: `Bearer ${authority.capability}`,
					"content-type": "application/json",
				},
				body,
				signal,
				redirect: "error",
			});
			const result = restResponseSchema.assert(
				JSON.parse(await readBody(response.body, undefined, undefined, signal)),
			);
			answered = true;
			if (result.ok) return result.value;
			if (result.status !== undefined)
				throw new RestError(result.status, result.body);
			throw new ShardError(
				result.code,
				`${result.message} Operation: ${result.operationId}`,
			);
		} catch (error) {
			if (submitted && !answered && request.method !== "GET")
				throw new ShardError(
					"OUTCOME_UNKNOWN",
					`Mutation outcome is unknown. Query/reconcile operation ${operationId}; do not retry with a new ID.`,
				);
			throw error;
		} finally {
			this.bytes -= reserved;
			this.requests.delete(controller);
		}
	}
}
