import { type } from "arktype";
import {
	sameAssignment,
	type IdentifyOutcome,
	type IdentifyPermit,
	type ShardAssignment,
} from "../authority";
import { ShardError, type ShardSessionLimit } from "../types";
import { ControlStore } from "./ControlStore";

export const permitValidityMs = 15000;
export const admissionCooldownMs = 5500;
const limitsSchema = type({
	total: "number.integer > 0 & number <= 1000000",
	remaining: "number.integer >= 0",
	reset_after: "number.integer >= 0 & number <= 604800000",
	max_concurrency: "number.integer > 0 & number <= 4096",
});

/** Runtime-local one-shot grants. An unresolved sender holds its bucket until outcome or proven termination. */
export class Admission {
	private readonly wall = Date.now();
	private readonly monotonic = performance.now();
	private readonly startupDeadline: number;
	public constructor(
		private readonly store: ControlStore,
		private readonly reserve: number,
		private readonly clock?: () => number,
	) {
		this.startupDeadline = this.now() + admissionCooldownMs;
	}
	private now(): number {
		return this.clock?.() ?? this.wall + performance.now() - this.monotonic;
	}
	public get expired(): boolean {
		return (
			!this.store.state.budget ||
			this.now() >= this.store.state.budget.expiresAt
		);
	}
	public get remaining(): number {
		return this.expired ? 0 : this.store.state.budget!.remaining;
	}
	public get unresolved(): number {
		return Object.values(this.store.state.permits).filter(
			(p) => p.state === "reserved" || p.state === "unknown",
		).length;
	}
	public update(input: ShardSessionLimit): void {
		limitsSchema.assert(input);
		if (input.remaining > input.total)
			throw new TypeError("Session remaining exceeds total.");
		const now = this.now();
		this.store.change((state) => {
			const previous = state.budget;
			const unresolved = Object.values(state.permits).filter(
				(p) => p.state === "reserved" || p.state === "unknown",
			);
			if (
				previous &&
				previous.max_concurrency !== input.max_concurrency &&
				(unresolved.length ||
					Object.values(state.buckets).some((b) => b.until > now))
			)
				throw new ShardError(
					"SESSION_LIMIT",
					"Reconcile all old admission buckets before changing concurrency.",
				);
			const sameWindow = previous && now < previous.expiresAt;
			state.budget = {
				total: input.total,
				// Unresolved writes may occur after this observation. Count them conservatively;
				// never add consumption back within an observed window.
				remaining: Math.min(
					sameWindow ? previous.remaining : input.total,
					Math.max(0, input.remaining - unresolved.length),
				),
				max_concurrency: input.max_concurrency,
				expiresAt: Math.max(
					sameWindow ? previous.expiresAt : 0,
					now + (input.reset_after || 60000),
				),
				observedAt: now,
				windowId: sameWindow ? previous.windowId : crypto.randomUUID(),
			};
		});
	}
	public grant(
		assignment: ShardAssignment,
		attemptId: string,
		receivedAt: number,
	): IdentifyPermit | undefined {
		const now = this.now();
		const state = this.store.state;
		const lease = state.leases[String(assignment.shardId)];
		if (
			!lease ||
			lease.phase !== "owned" ||
			!sameAssignment(lease.assignment, assignment)
		)
			throw new ShardError(
				"OWNERSHIP",
				"Admission requires the current owned assignment.",
			);
		const old = state.permits[attemptId];
		if (old) {
			if (!sameAssignment(old.permit.assignment, assignment))
				throw new ShardError(
					"OWNERSHIP",
					"Attempt ID belongs to a different owner.",
				);
			return old.state === "reserved" ? old.permit : undefined;
		}
		if (
			!this.store.healthy ||
			!state.recoveryConfirmed ||
			state.credentialBlocked ||
			state.admissionFault ||
			this.expired ||
			this.remaining <= this.reserve ||
			now < this.startupDeadline ||
			now < state.clockFloor ||
			performance.now() - receivedAt >= permitValidityMs
		)
			return;
		const budget = state.budget!;
		const bucket = assignment.shardId % budget.max_concurrency;
		const previous = state.buckets[String(bucket)];
		if (previous && (previous.active || previous.until > now)) return;
		if (Object.keys(state.permits).length >= 100000)
			throw new ShardError(
				"ADMISSION_CAPACITY",
				"Admission history is full; stop admission and perform a controlled fleet recovery.",
			);
		const permit: IdentifyPermit = {
			permitId: crypto.randomUUID(),
			attemptId,
			assignment,
			coordinatorTerm: state.term,
			bucket,
			budgetWindowId: budget.windowId,
			validityMs: permitValidityMs,
		};
		this.store.change((next) => {
			next.budget!.remaining--;
			next.clockFloor = now;
			next.permits[attemptId] = { permit, state: "reserved", issuedAt: now };
			next.buckets[String(bucket)] = {
				until: now + admissionCooldownMs,
				active: attemptId,
			};
		});
		return permit;
	}
	public outcome(outcome: IdentifyOutcome): void {
		const old = this.store.state.permits[outcome.attemptId];
		if (!old) return; // Cancelled before reservation; the caller has disabled that attempt.
		if (!sameAssignment(old.permit.assignment, outcome.assignment))
			throw new ShardError(
				"OWNERSHIP",
				"Outcome does not match the original reservation.",
			);
		if (old.state === outcome.kind) return;
		const now = this.now();
		this.store.change((state) => {
			const entry = state.permits[outcome.attemptId];
			const bucket = state.buckets[String(entry.permit.bucket)];
			if (
				(entry.state === "sent" && outcome.kind === "revokedBeforeSend") ||
				(entry.state === "revokedBeforeSend" && outcome.kind === "sent")
			) {
				state.admissionFault =
					"Contradictory IDENTIFY outcome; inspect the original sender before recovery.";
				entry.state = "unknown";
				return;
			}
			if (entry.state === "sent" || entry.state === "revokedBeforeSend") return;
			entry.state = outcome.kind;
			if (outcome.kind === "unknown") return;
			entry.receivedAt = now;
			state.clockFloor = Math.max(state.clockFloor, now);
			if (bucket) {
				bucket.until = Math.max(bucket.until, now + admissionCooldownMs);
				if (bucket.active === outcome.attemptId) delete bucket.active;
			}
		});
	}
	/** Exact-incarnation exit/release evidence disables every future send; spent allowance is never refunded. */
	public fenced(assignment: ShardAssignment): void {
		for (const entry of Object.values(this.store.state.permits))
			if (
				sameAssignment(entry.permit.assignment, assignment) &&
				(entry.state === "unknown" || entry.state === "reserved")
			)
				this.outcome({
					attemptId: entry.permit.attemptId,
					assignment,
					kind: "sent",
				});
	}
}
