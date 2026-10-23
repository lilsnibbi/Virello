import type { ShardAssignment } from "../../../src/sharding/authority";
import { ControlStore } from "../../../src/sharding/coordinator/ControlStore";

export function assignment(shardId = 0): ShardAssignment {
	return {
		applicationId: "test-app",
		layoutVersion: "1",
		assignmentEpoch: String(shardId + 1),
		totalShards: 4,
		shardId,
		hostId: "test-host",
		hostBootId: "host-boot",
		workerBootId: `worker-${shardId}`,
		deploymentId: "build-one",
	};
}
export async function authority(development = true) {
	const store = new ControlStore(
		"test-app",
		4,
		new Map([[0, "test-host"]]),
		"build-one",
		development,
	);
	await store.ready;
	store.change((state) => {
		for (let shard = 0; shard < 4; shard++)
			state.leases[String(shard)] = {
				assignment: assignment(shard),
				phase: "owned",
				capability: `test-capability-${shard}-000000000000000000000000`,
			};
	});
	return store;
}
