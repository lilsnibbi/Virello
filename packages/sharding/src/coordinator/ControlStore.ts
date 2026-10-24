import { SQL } from "bun";
import { type } from "arktype";
import { assignmentSchema, epochSchema, permitSchema } from "../authority";
import { ShardError } from "../types";

export const leaseSchema = type({
	assignment: assignmentSchema,
	capability: "string >= 32 & string <= 128",
	phase: "'owned' | 'draining' | 'release_unknown'",
	"releaseOperationId?": "string",
});
const stateSchema = type({
	version: "1",
	applicationId: "string",
	term: epochSchema,
	epoch: epochSchema,
	layoutVersion: epochSchema,
	count: "number.integer > 0 & number <= 4096",
	configurationRevision: "string",
	placements: { "[string]": "string" },
	leases: { "[string]": leaseSchema },
	releases: {
		"[string]": {
			assignment: assignmentSchema,
			status: "'draining' | 'unknown' | 'released'",
			evidence: "string",
		},
	},
	permits: {
		"[string]": {
			permit: permitSchema,
			state: "'reserved' | 'sent' | 'revokedBeforeSend' | 'unknown'",
			issuedAt: "number",
			"receivedAt?": "number",
		},
	},
	buckets: { "[string]": { until: "number", "active?": "string" } },
	"budget?": {
		total: "number.integer > 0",
		remaining: "number.integer >= 0",
		max_concurrency: "number.integer > 0 & number <= 4096",
		expiresAt: "number",
		observedAt: "number",
		windowId: "string",
	},
	credentialBlocked: "boolean",
	recoveryConfirmed: "boolean",
	"recoveryEvidence?": { operationId: "string", evidence: "string" },
	"admissionFault?": "string",
	"transition?": {
		id: "string",
		phase: "'draining' | 'starting' | 'degraded'",
		count: "number.integer > 0 & number <= 4096",
		placements: { "[string]": "string" },
		reason: "string",
	},
	clockFloor: "number",
});
export type ControlState = typeof stateSchema.infer;
export type StoredLease = typeof leaseSchema.infer;

/** Connection-lifetime state. No disk path, persistence adapter, or cross-process lock. */
export class ControlStore {
	public readonly operations = new SQL(":memory:");
	public readonly ready: Promise<unknown>;
	private value: ControlState;
	private failed = false;
	public constructor(
		applicationId: string,
		count: number,
		placements: ReadonlyMap<number, string>,
		configurationRevision: string,
		development = false,
	) {
		// A random incarnation namespace prevents reuse of an old epoch after memory is lost.
		const term = BigInt(
			`0x${crypto.randomUUID().replaceAll("-", "")}`,
		).toString();
		this.value = {
			version: 1,
			applicationId,
			term,
			epoch: "0",
			layoutVersion: term,
			count,
			configurationRevision,
			placements: Object.fromEntries(placements),
			leases: {},
			releases: {},
			permits: {},
			buckets: {},
			credentialBlocked: false,
			recoveryConfirmed: development,
			clockFloor: 0,
		};
		this.ready = this
			.operations`CREATE TABLE rest_operations (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, execution_key TEXT NOT NULL, epoch TEXT NOT NULL, status TEXT NOT NULL, result TEXT, created_at REAL NOT NULL)`;
	}
	public get state(): Readonly<ControlState> {
		return this.value;
	}
	public get healthy(): boolean {
		return !this.failed;
	}
	/** Synchronous validate-and-swap: no observer sees a partially applied authority transition. */
	public change<T>(update: (state: ControlState) => T): T {
		if (this.failed)
			throw new ShardError("STORE_UNAVAILABLE", "Coordinator state is closed.");
		const next = structuredClone(this.value);
		const result = update(next);
		stateSchema.assert(next);
		this.value = next;
		return result;
	}
	public async close(): Promise<void> {
		this.failed = true;
		await this.operations.close();
	}
}
