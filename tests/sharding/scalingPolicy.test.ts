import { expect, test } from "bun:test";
import { ScalingPolicy } from "../../src/sharding/coordinator/scaling";
import type { ShardHost } from "../../src/sharding/types";

const hosts: ShardHost[] = [
	{ id: "a", token: "", shards: [0, 1], maxShards: 4 },
	{ id: "b", token: "", shards: [2, 3], maxShards: 4 },
];
const assignment = new Map([
	[0, "a"],
	[1, "a"],
	[2, "b"],
	[3, "b"],
]);
test("recommendations, guild targets, bounds and capacity determine legal totals", () => {
	const policy = new ScalingPolicy({
		maxShards: 8,
		minShards: 2,
		targetGuildsPerShard: 1000,
	});
	expect(policy.plan(3, hosts, assignment).count).toBe(3);
	expect(
		policy.plan(
			2,
			hosts,
			assignment,
			new Map([
				[0, 2200],
				[1, 2200],
				[2, 2200],
				[3, 2200],
			]),
		).count,
	).toBe(8);
	expect(policy.plan(3, hosts, assignment, new Map([[0, 10000]])).reason).toBe(
		"capacity_limited",
	);
	expect(() => policy.plan(9, hosts, assignment)).toThrow("capacity");
	for (const recommended of [NaN, 0, 1.5, 4097])
		expect(() => policy.plan(recommended, hosts, assignment)).toThrow(
			"recommended",
		);
	expect(() => new ScalingPolicy({ maxShards: 1, minShards: 2 })).toThrow();
	expect(
		() => new ScalingPolicy({ maxShards: 4, pollIntervalMs: 1000 }),
	).toThrow();
});
test("disabled downscaling preserves a legal recommendation multiple and rejects insufficient capacity", () => {
	const policy = new ScalingPolicy({ maxShards: 8, allowDownscale: false });
	expect(policy.plan(1, hosts, assignment).count).toBe(4);
	expect(policy.plan(3, hosts, assignment).count).toBe(6);
	expect(() =>
		new ScalingPolicy({ maxShards: 4, allowDownscale: false }).plan(
			3,
			hosts,
			assignment,
		),
	).toThrow("capacity");
});
test("whole-shard allocation reduces weighted peak load without exceeding host capacity", () => {
	const policy = new ScalingPolicy({ maxShards: 4, minShards: 4 });
	const plan = policy.plan(
		1,
		hosts,
		assignment,
		new Map([
			[0, 1000],
			[1, 1000],
			[2, 100],
			[3, 100],
		]),
	);
	expect(plan.reason).toBe("host_load");
	expect(plan.assignments.get(0)).not.toBe(plan.assignments.get(1));
	const weighted = policy.plan(
		1,
		[
			{ ...hosts[0], maxShards: 3, weight: 3 },
			{ ...hosts[1], maxShards: 1 },
		],
		new Map(),
	);
	expect(
		[...weighted.assignments.values()].filter((host) => host === "a"),
	).toHaveLength(3);
	expect(
		[...weighted.assignments.values()].filter((host) => host === "b"),
	).toHaveLength(1);
	expect(
		policy.plan(
			1,
			hosts,
			assignment,
			new Map([
				[0, 100],
				[1, 100],
				[2, 100],
				[3, 100],
			]),
		).assignments,
	).toEqual(assignment);
});
test("confirmation hysteresis, cooldown and stable observations prevent oscillating transitions", () => {
	let now = 0;
	const policy = new ScalingPolicy(
		{ maxShards: 8, confirmations: 2, cooldownMs: 60000 },
		() => now,
	);
	const up = policy.plan(6, hosts, assignment);
	const down = policy.plan(2, hosts, assignment);
	expect(policy.observe(up, assignment)).toBe("confirming");
	expect(policy.observe(down, assignment)).toBe("confirming");
	expect(policy.observe(up, assignment)).toBe("confirming");
	expect(policy.observe(up, assignment)).toBe("change");
	policy.changed();
	expect(policy.observe(up, assignment)).toBe("cooldown");
	now = 60000;
	expect(policy.observe(up, assignment)).toBe("confirming");
	expect(
		policy.observe(
			{ count: 4, assignments: assignment, reason: "stable" },
			assignment,
		),
	).toBe("stable");
	expect(policy.observe(up, assignment)).toBe("confirming");
	policy.reset();
	expect(policy.observe(up, assignment)).toBe("confirming");
});
