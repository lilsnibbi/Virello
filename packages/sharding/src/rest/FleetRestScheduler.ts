import { createHash } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import type { RESTGetAPIGatewayBotResult } from "discord-api-types/v10";
import {
	RestClient,
	type $RestOptions,
	type $RestRequest,
} from "@virello/rest";
import { RestError } from "@virello/rest";
import { routeKey } from "@virello/rest/routes";
import { sameAssignment, type ShardAssignment } from "../authority";
import { ControlStore } from "../coordinator/ControlStore";
import { ShardError } from "../types";
import { tokenMatches } from "../transport/protocol";
import { readBody, restRequestSchema } from "./protocol";

interface Operation {
	id: string;
	fingerprint: string;
	execution_key: string;
	epoch: string;
	status: string;
	result: string | null;
	created_at: number;
}
interface Inflight {
	assignment: ShardAssignment;
	attempted: boolean;
}
const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex");

/** One process-local fleet dispatcher. Bodies never travel over lifecycle WS/IPC. */
export class FleetRestScheduler {
	private readonly ordinary: RestClient;
	private readonly interactions: RestClient;
	private readonly lifetime = new AbortController();
	private readonly inflight = new Map<string, Inflight>();
	private readonly internal = new Set<string>();
	private readonly lanes = new Map<string, Promise<void>>();
	private pending = 0;
	private ordinaryPending = 0;
	private bytes = 0;
	private readonly warmup = performance.now() + 1000;
	public constructor(
		private readonly store: ControlStore,
		token: string,
		options: $RestOptions = {},
	) {
		const common: $RestOptions = {
			...options,
			scheduler: undefined,
			maxRetries: 0,
			maxConcurrentRequests: 1,
			maxPendingRequests: 128,
			maxResponseBytes: 1024 * 1024,
			beforeSend: (request) => this.beforeSend(request),
		};
		// Serialize ordinary requests, including unknown bucket aliases, conservatively.
		// Initial interaction callbacks are token-scoped and do not spend bot global allowance.
		this.ordinary = new RestClient(token, common);
		this.interactions = new RestClient(token, {
			...common,
			maxConcurrentRequests: 8,
		});
	}
	public get status() {
		return {
			pending: this.pending,
			queuedBytes: this.bytes,
			inFlight: this.inflight.size,
			credentialBlocked: this.store.state.credentialBlocked,
		};
	}
	/** Coordinator metadata uses the same bot queue and global allowance as fleet requests. */
	public async gateway(
		signal?: AbortSignal,
	): Promise<RESTGetAPIGatewayBotResult> {
		const id = crypto.randomUUID();
		this.internal.add(id);
		try {
			return await this.ordinary.request({
				method: "GET",
				path: "/gateway/bot",
				operationId: id,
				signal,
			});
		} catch (error) {
			if (error instanceof RestError && error.status === 401)
				this.store.change((state) => {
					state.credentialBlocked = true;
				});
			throw error;
		} finally {
			this.internal.delete(id);
		}
	}
	public async drain(
		assignment: ShardAssignment,
		timeoutMs: number,
	): Promise<void> {
		const deadline = performance.now() + timeoutMs;
		while (
			[...this.inflight.values()].some((entry) =>
				sameAssignment(entry.assignment, assignment),
			)
		) {
			if (performance.now() >= deadline)
				throw new ShardError(
					"RELEASE_UNKNOWN",
					"Fleet HTTP dispatcher still has accepted work for this epoch.",
				);
			await wait(20, undefined, { signal: this.lifetime.signal });
		}
	}
	private authorize(assignment: ShardAssignment): void {
		const lease = this.store.state.leases[String(assignment.shardId)];
		if (
			!this.store.healthy ||
			!lease ||
			lease.phase !== "owned" ||
			!sameAssignment(lease.assignment, assignment)
		)
			throw new ShardError("RELEASED", "The effect epoch is not authorized.");
		if (this.store.state.credentialBlocked)
			throw new ShardError(
				"CREDENTIAL_BLOCKED",
				"The bot credential circuit is open.",
			);
	}
	private beforeSend(request: $RestRequest): void {
		const id = request.operationId ?? "";
		if (this.internal.has(id)) {
			if (this.store.state.credentialBlocked)
				throw new ShardError(
					"CREDENTIAL_BLOCKED",
					"The bot credential circuit is open.",
				);
			return;
		}
		const active = this.inflight.get(id);
		if (!active)
			throw new ShardError("RELEASED", "The HTTP dispatch capability expired.");
		this.authorize(active.assignment);
		active.attempted = true;
	}
	/** Inspect an operation in this incarnation only; an absent record after restart proves nothing. */
	public async operation(id: string): Promise<Readonly<Operation> | undefined> {
		const rows = await this.store.operations<
			Operation[]
		>`SELECT * FROM rest_operations WHERE id=${id}`;
		return rows[0];
	}
	/** Clear quarantine only after endpoint-specific evidence establishes effect disposition and ordering. */
	public async reconcile(
		id: string,
		result: unknown,
		evidence: string,
	): Promise<void> {
		if (evidence.trim().length < 16 || evidence.length > 2000)
			throw new ShardError(
				"EVIDENCE",
				"Record external reconciliation evidence before clearing quarantine.",
			);
		const record = await this.operation(id);
		if (!record || record.status !== "unknown" || this.inflight.has(id))
			throw new ShardError(
				"STATE",
				"Only a settled unknown HTTP operation can be reconciled.",
			);
		await this.finish(id, "succeeded", {
			ok: true,
			value: result ?? null,
			evidence,
		});
	}
	private lane(key: string): { previous: Promise<void>; release: () => void } {
		const previous = this.lanes.get(key) ?? Promise.resolve();
		const done = Promise.withResolvers<void>();
		const tail = previous.then(() => done.promise);
		this.lanes.set(key, tail);
		void tail.then(() => {
			if (this.lanes.get(key) === tail) this.lanes.delete(key);
		});
		return { previous, release: () => done.resolve() };
	}
	public async handle(request: Request): Promise<Response> {
		if (request.method !== "POST")
			return new Response("Method not allowed", { status: 405 });
		if (this.lifetime.signal.aborted || this.pending >= 128)
			return Response.json(
				{
					ok: false,
					code: "OVERLOADED",
					message: "Fleet HTTP queue is unavailable.",
					operationId: "unaccepted",
				},
				{ status: 503 },
			);
		const lease = Object.values(this.store.state.leases).find((record) =>
			tokenMatches(request.headers.get("authorization"), record.capability),
		);
		if (!lease)
			return Response.json(
				{
					ok: false,
					code: "AUTHENTICATION",
					message: "Invalid effect capability.",
					operationId: "unaccepted",
				},
				{ status: 401 },
			);
		this.pending++;
		const started = performance.now();
		let size = 0;
		let id = "unaccepted";
		let mutation = false;
		let authenticated = true;
		let ordinary = false;
		let claimed = false;
		let active: Inflight | undefined;
		let lane: ReturnType<FleetRestScheduler["lane"]> | undefined;
		try {
			const input = await readBody(
				request.body,
				undefined,
				(count) => {
					if (this.bytes + count > 64 * 1024 * 1024)
						throw new ShardError(
							"OVERLOADED",
							"Fleet HTTP byte capacity reached.",
						);
					size += count;
					this.bytes += count;
				},
				AbortSignal.any([
					request.signal,
					this.lifetime.signal,
					AbortSignal.timeout(15000),
				]),
			);
			const data = restRequestSchema.assert(JSON.parse(input));
			id = data.operationId;
			authenticated = data.auth;
			const callback =
				!data.auth &&
				data.method === "POST" &&
				/^\/interactions\/\d+\/[^/]+\/callback$/.test(data.path);
			if (!callback) {
				if (this.ordinaryPending >= 112)
					throw new ShardError(
						"OVERLOADED",
						"Ordinary HTTP capacity reached; callback capacity is reserved.",
					);
				this.ordinaryPending++;
				ordinary = true;
			}
			if (!sameAssignment(lease.assignment, data.assignment))
				throw new ShardError(
					"OWNERSHIP",
					"HTTP capability and assignment differ.",
				);
			this.authorize(data.assignment);
			// Register before the first asynchronous lookup so release sees accepted work.
			if (this.inflight.has(id))
				throw new ShardError(
					"OUTCOME_UNKNOWN",
					"This operation is already active; no replay occurred.",
				);
			active = { assignment: data.assignment, attempted: false };
			this.inflight.set(id, active);
			const remaining = Math.floor(
				data.deadlineMs - (performance.now() - started),
			);
			if (remaining <= 0)
				throw new ShardError(
					"TIMEOUT",
					"HTTP deadline elapsed before admission.",
				);
			const signal = AbortSignal.any([
				request.signal,
				this.lifetime.signal,
				AbortSignal.timeout(remaining),
			]);
			mutation = data.method !== "GET";
			const route = routeKey(data.method, data.path);
			const key = hash(
				data.executionKey ??
					(callback ? data.path : route.major || route.route),
			);
			const fingerprint = hash(
				JSON.stringify([
					data.method,
					data.path,
					data.body ?? null,
					data.files ?? [],
					data.auth,
					data.executionKey ?? null,
					data.reason ?? null,
				]),
			);
			if (mutation) {
				lane = this.lane(key);
				// A cancelled waiter keeps its place until its predecessor settles.
				await new Promise<void>((resolve, reject) => {
					const abort = () => reject(signal.reason);
					signal.addEventListener("abort", abort, { once: true });
					void lane!.previous
						.then(resolve)
						.finally(() => signal.removeEventListener("abort", abort));
					if (signal.aborted) abort();
				});
			}
			signal.throwIfAborted();
			const existing = await this.operation(id);
			if (existing) {
				if (existing.fingerprint !== fingerprint)
					throw new ShardError(
						"OPERATION_ID",
						"Operation ID already has a different payload.",
					);
				if (
					existing.result &&
					["succeeded", "rejected"].includes(existing.status)
				)
					return Response.json(JSON.parse(existing.result));
				throw new ShardError(
					"OUTCOME_UNKNOWN",
					"Original mutation is pending or unresolved; no replay occurred.",
				);
			}
			this.authorize(data.assignment);
			if (mutation)
				await this.store.operations.begin(async (sql) => {
					if (
						(
							await sql`SELECT id FROM rest_operations WHERE execution_key=${key} AND status IN ('pending','unknown') LIMIT 1`
						).length
					)
						throw new ShardError(
							"EFFECT_QUARANTINED",
							"An earlier mutation for this execution key is unresolved.",
						);
					const [{ count }] = await sql<
						{ count: number }[]
					>`SELECT COUNT(*) AS count FROM rest_operations`;
					if (count >= 10000)
						throw new ShardError(
							"JOURNAL_CAPACITY",
							"Operation history is full; stop admission and perform a controlled fleet recovery.",
						);
					await sql`INSERT INTO rest_operations VALUES(${id},${fingerprint},${key},${data.assignment.assignmentEpoch},'pending',NULL,${Date.now()})`;
					claimed = true;
				});
			const elapsed = Math.max(0, this.warmup - performance.now());
			if (elapsed) await wait(elapsed, undefined, { signal });
			const value = await (
				callback ? this.interactions : this.ordinary
			).request({
				...data,
				signal,
				files: data.files?.map((file) => ({
					name: file.name,
					data: new Blob([Buffer.from(file.data, "base64")]),
				})),
			});
			const result = { ok: true, value: value ?? null };
			if (claimed) await this.finish(id, "succeeded", result);
			return Response.json(result);
		} catch (error) {
			if (error instanceof RestError && error.status === 401 && authenticated)
				this.store.change((state) => {
					state.credentialBlocked = true;
				});
			const unknown =
				mutation &&
				claimed &&
				active?.attempted &&
				(!(error instanceof RestError) || error.status >= 500);
			const result = {
				ok: false,
				operationId: id,
				code: unknown
					? "OUTCOME_UNKNOWN"
					: error instanceof ShardError
						? error.code
						: error instanceof RestError
							? "REST"
							: "HTTP_FAILED",
				message: unknown
					? "Submitted mutation outcome is unknown; its execution key is quarantined."
					: error instanceof Error
						? error.message.slice(0, 500)
						: "HTTP operation failed.",
				...(error instanceof RestError && !unknown
					? { status: error.status, body: error.body }
					: {}),
			};
			if (claimed)
				await this.finish(id, unknown ? "unknown" : "rejected", result);
			return Response.json(result);
		} finally {
			lane?.release();
			if (active && this.inflight.get(id) === active) this.inflight.delete(id);
			this.pending--;
			if (ordinary) this.ordinaryPending--;
			this.bytes -= size;
		}
	}
	private async finish(
		id: string,
		status: string,
		result: unknown,
	): Promise<void> {
		let encoded = JSON.stringify(result);
		await this.store.operations.begin(async (sql) => {
			const [{ size }] = await sql<
				{ size: number }[]
			>`SELECT COALESCE(SUM(length(CAST(result AS BLOB))),0) AS size FROM rest_operations WHERE id != ${id}`;
			if (
				status === "succeeded" &&
				(Buffer.byteLength(encoded) > 1024 * 1024 ||
					size + Buffer.byteLength(encoded) > 32 * 1024 * 1024)
			)
				throw new ShardError(
					"OUTCOME_UNKNOWN",
					"Effect completed but the bounded result history is full; reconcile before replay.",
				);
			if (
				status !== "succeeded" &&
				(Buffer.byteLength(encoded) > 1024 * 1024 ||
					size + Buffer.byteLength(encoded) > 32 * 1024 * 1024)
			)
				encoded = JSON.stringify({
					ok: false,
					operationId: id,
					code: status === "unknown" ? "OUTCOME_UNKNOWN" : "REST_REJECTED",
					message:
						"Detailed error exceeded the bounded history; inspect the external endpoint before retrying.",
				});
			await sql`UPDATE rest_operations SET status=${status},result=${encoded} WHERE id=${id}`;
		});
	}
	public async close(): Promise<void> {
		this.lifetime.abort();
		this.ordinary.close();
		this.interactions.close();
		while (this.pending) await wait(10);
	}
}
