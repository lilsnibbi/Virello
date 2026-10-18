import { expect, test } from "bun:test";
import { VirelloClient } from "../../src/core/client/VirelloClient";
import { ManagedGateway } from "../../src/sharding/client/gateway";
import { Availability } from "../../src/sharding/transport/availability";
import { logger, stack, until } from "./helpers";

test("coordinator waits fail by default and bound capacity, time and cancellation", async () => {
	const availability = new Availability();
	await expect(availability.prepare({}, 1000, 1)).rejects.toMatchObject({
		code: "DISCONNECTED",
	});
	const controller = new AbortController();
	const pending = availability.prepare(
		{ waitForCoordinator: true, signal: controller.signal },
		1000,
		1,
	);
	const rejected = pending.catch((error) => error);
	await expect(
		availability.prepare({ waitForCoordinator: true }, 1000, 1),
	).rejects.toMatchObject({ code: "CAPACITY" });
	controller.abort(new Error("cancelled"));
	expect(await rejected).toMatchObject({ message: "cancelled" });
	await expect(
		availability.prepare({ waitForCoordinator: true, timeoutMs: 10 }, 1000, 1),
	).rejects.toMatchObject({ code: "TIMEOUT" });
	const recovery = availability.prepare(
		{ waitForCoordinator: true, timeoutMs: 1000 },
		1000,
		1,
	);
	await Bun.sleep(20);
	availability.set(true);
	expect((await recovery).timeoutMs).toBeLessThan(1000);
	availability.close();
});

test("same-ID total changes retire the old gateway and dormant assignments have no connection", async () => {
	const client = new VirelloClient({ intents: [], logger });
	const gateway = new ManagedGateway(
		client,
		async () => {},
		() => {},
	);
	const events: string[] = [];
	try {
		let connectedCount: number | undefined;
		const reassign = client.reassignGateway.bind(client);
		Reflect.set(client, "openGateway", async () => {
			connectedCount = client.options.gateway!.shard![1];
			events.push(`connect:${connectedCount}`);
			return "offline-placeholder";
		});
		Reflect.set(
			client,
			"reassignGateway",
			(shard: readonly [number, number] | null) => {
				if (connectedCount !== undefined)
					events.push(`close:${connectedCount}`);
				connectedCount = undefined;
				reassign(shard);
			},
		);
		await gateway.reconcile(0, 2);
		await gateway.start("offline-placeholder");
		await gateway.reconcile(0, 2);
		expect(events).toEqual(["connect:2"]);
		await gateway.reconcile(0, 3);
		expect(events).toEqual(["connect:2", "close:2"]);
		expect(client.options.gateway?.shard).toEqual([0, 3]);
		await gateway.start("offline-placeholder");
		await gateway.reconcile(null, 3);
		expect(events).toEqual(["connect:2", "close:2", "connect:3", "close:3"]);
		expect(client.options.gateway?.shard).toBeUndefined();
	} finally {
		gateway.stop();
		await client.destroy();
	}
});

test("assigned outages terminate the child but full-capacity dormancy survives the same cutoff", async () => {
	const s = await stack({
		shardCount: 1,
		workers: [
			{
				id: "a",
				token: "test-only-public-placeholder-host-A-0000",
				shards: [0],
			},
		],
	});
	try {
		const owner = await s.host("a", {
			maxDisconnectedLifetimeMs: 100,
			restart: false,
		});
		await until(() => owner.processes[0]?.state === "running");
		const standby = await s.host("a", {
			maxDisconnectedLifetimeMs: 100,
			assignmentPollIntervalMs: 50,
			restart: false,
		});
		await until(() => standby.processes[0]?.state === "dormant");
		const standbyPid = standby.processes[0].pid;
		await Bun.sleep(250);
		expect(standby.processes[0].pid).toBe(standbyPid);
		await owner.close();
		await until(() => standby.processes[0]?.state === "running");
		expect(standby.processes[0].pid).toBe(standbyPid);
		await s.coordinator.close();
		await until(() => standby.processes[0]?.state === "failed");
		expect(standby.processes[0].pid).toBeNull();
	} finally {
		await s.close();
	}
});
