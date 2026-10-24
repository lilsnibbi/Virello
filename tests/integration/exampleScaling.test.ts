import { expect, test } from "bun:test";
import { scalingOptions, workerAssignments } from "../../examples/config";

test("example scaling remains opt-in and parses explicit bounds and host capacity", () => {
	const names = [
		"SHARD_SCALING",
		"SHARD_WORKERS",
		"SHARD_HOST_ID",
		"SHARD_HOST_TOKEN",
		"SHARD_HOST_MAX_SHARDS",
	] as const;
	const previous = new Map(names.map((name) => [name, Bun.env[name]]));
	try {
		for (const name of names) delete Bun.env[name];
		expect(scalingOptions()).toBeUndefined();
		Bun.env.SHARD_SCALING =
			'{"minShards":2,"maxShards":4,"allowDownscale":false}';
		expect(scalingOptions()).toEqual({
			minShards: 2,
			maxShards: 4,
			allowDownscale: false,
		});
		Bun.env.SHARD_HOST_TOKEN = "synthetic-host-secret-0000000000000000";
		Bun.env.SHARD_HOST_MAX_SHARDS = "4";
		expect(workerAssignments(2)[0].maxShards).toBe(4);
		Bun.env.SHARD_WORKERS =
			'[{"id":"a","token":"synthetic","shards":[],"maxShards":4,"weight":2}]';
		expect(workerAssignments(1)[0]).toEqual({
			id: "a",
			token: "synthetic",
			shards: [],
			maxShards: 4,
			weight: 2,
		});
		Bun.env.SHARD_SCALING = '{"maxShards":4,"typo":true}';
		expect(scalingOptions).toThrow("SHARD_SCALING");
		Bun.env.SHARD_SCALING = '{"maxShards":"4"}';
		expect(scalingOptions).toThrow("SHARD_SCALING");
	} finally {
		for (const [name, value] of previous) {
			if (value === undefined) delete Bun.env[name];
			else Bun.env[name] = value;
		}
	}
});
