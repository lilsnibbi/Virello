import { type } from "arktype";

const id = type("string").narrow((v) => /^[a-zA-Z0-9:_-]{1,128}$/.test(v));
export const epochSchema = type("string").narrow((v) =>
	/^(0|[1-9]\d{0,39})$/.test(v),
);
export const assignmentSchema = type({
	applicationId: id,
	layoutVersion: epochSchema,
	shardId: "number.integer >= 0 & number <= 4095",
	totalShards: "number.integer > 0 & number <= 4096",
	assignmentEpoch: epochSchema,
	hostId: id,
	hostBootId: id,
	workerBootId: id,
	deploymentId: id,
	"+": "reject",
});
/** Identity of one committed owner. Epochs are decimal integers, not lexical strings. */
export type ShardAssignment = typeof assignmentSchema.infer;
export const permitSchema = type({
	permitId: id,
	attemptId: id,
	assignment: assignmentSchema,
	coordinatorTerm: epochSchema,
	bucket: "number.integer >= 0",
	budgetWindowId: id,
	validityMs: "number.integer > 0 & number <= 15000",
	"+": "reject",
});
export type IdentifyPermit = typeof permitSchema.infer;
export const permitOutcomeSchema = type({
	attemptId: id,
	assignment: assignmentSchema,
	kind: "'sent' | 'revokedBeforeSend' | 'unknown'",
	"+": "reject",
});
export type IdentifyOutcome = typeof permitOutcomeSchema.infer;

export function sameAssignment(
	a: ShardAssignment,
	b: ShardAssignment,
): boolean {
	return (
		a.applicationId === b.applicationId &&
		a.layoutVersion === b.layoutVersion &&
		a.shardId === b.shardId &&
		a.totalShards === b.totalShards &&
		a.assignmentEpoch === b.assignmentEpoch &&
		a.hostId === b.hostId &&
		a.hostBootId === b.hostBootId &&
		a.workerBootId === b.workerBootId &&
		a.deploymentId === b.deploymentId
	);
}
