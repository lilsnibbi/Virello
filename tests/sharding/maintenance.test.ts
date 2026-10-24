import { expect, test } from "bun:test";
import { VirelloClient } from "../../packages/core/src/core/client/VirelloClient";
import { ManagedGateway } from "../../packages/sharding/src/client/gateway";
import { Availability } from "../../packages/sharding/src/transport/availability";
import { ready } from "../engine/fixtures";
import { FakeClock, FakeSocket, flush } from "../engine/support";
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

test("assigned outages and full-capacity dormancy keep the child alive beyond the old cutoff", async () => {
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
		await until(() => standby.processes[0]?.state === "maintenance");
		await Bun.sleep(750);
		expect(standby.processes[0].pid).toBe(standbyPid);
		expect(standby["children"].get(0)!.process.exitCode).toBeNull();
	} finally {
		await s.close();
	}
});

test("suspension cancels pending native identification and independent gateway reconnection", async () => {
	const clock = new FakeClock();
	const sockets: FakeSocket[] = [];
	const permit = Promise.withResolvers<void>();
	let authority = Promise.withResolvers<void>();
	let authorized = true;
	let deferPermit = true;
	const client = new VirelloClient({
		intents: [],
		logger,
		clock,
		waitForIdentify: () => (deferPermit ? permit.promise : Promise.resolve()),
		rest: {
			fetch: async () =>
				Response.json({
					url: "wss://offline.example.test",
					shards: 1,
					session_start_limit: {
						total: 10,
						remaining: 10,
						reset_after: 60000,
						max_concurrency: 1,
					},
				}),
		},
		gateway: {
			socket: () => {
				const socket = new FakeSocket();
				sockets.push(socket);
				return socket;
			},
		},
	});
	const failures: unknown[] = [];
	const gateway = new ManagedGateway(
		client,
		() => (authorized ? Promise.resolve() : authority.promise),
		(error) => failures.push(error),
	);
	let starting: Promise<string> | undefined;
	try {
		await gateway.reconcile(0, 1);
		starting = gateway.start("offline-placeholder");
		void starting.catch(() => {});
		await flush();
		expect(sockets).toHaveLength(1);
		sockets[0].receive({ op: 10, d: { heartbeat_interval: 1000 } });
		await flush();
		authorized = false;
		gateway.suspend();
		expect(sockets[0].closed).toBe(1000);
		permit.resolve();
		await clock.advance(30000);
		expect(sockets[0].sent.some((packet) => packet.op === 2)).toBe(false);
		expect(sockets).toHaveLength(1);
		deferPermit = false;
		await gateway.reconcile(0, 1);
		authorized = true;
		authority.resolve();
		gateway.resume();
		await flush();
		expect(sockets).toHaveLength(2);
		sockets[1].receive({ op: 10, d: { heartbeat_interval: 1000 } });
		await flush();
		expect(sockets[1].sent.filter((packet) => packet.op === 2)).toHaveLength(1);
		sockets[1].receive({ op: 0, t: "READY", s: 1, d: ready() });
		await starting;
		sockets[1].receive({ op: 7, d: null });
		authorized = false;
		authority = Promise.withResolvers<void>();
		gateway.suspend();
		await clock.advance(30000);
		expect(sockets).toHaveLength(2);
		expect(failures).toEqual([]);
	} finally {
		gateway.stop();
		authority.resolve();
		permit.resolve();
		await starting?.catch(() => {});
		await client.destroy();
	}
});
