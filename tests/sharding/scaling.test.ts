import { expect, spyOn, test } from "bun:test";
import "./fixtures/contracts";
import { ShardCoordinator } from "../../src/sharding/coordinator/Coordinator";
import { ShardManager } from "../../src/sharding/manager/Manager";
import { decode, frame } from "../../src/sharding/transport/protocol";
import type { ShardScalingOptions } from "../../src/sharding/types";
import {
	fixture,
	logger,
	sessionLimit,
	tokenA,
	tokenB,
	until,
} from "./helpers";

async function cluster(
	scaling: Partial<ShardScalingOptions> = {},
	failCount?: number,
) {
	const metadata = { shards: 1, remaining: 100, fail: false, requests: 0 };
	const originalFetch = globalThis.fetch;
	globalThis.fetch = Object.assign(
		async (...args: Parameters<typeof fetch>): Promise<Response> => {
			if (String(args[0]) === "https://discord.com/api/v10/gateway/bot") {
				metadata.requests++;
				if (metadata.fail) return new Response(null, { status: 503 });
				return Response.json({
					shards: metadata.shards,
					session_start_limit: {
						...sessionLimit,
						remaining: metadata.remaining,
					},
				});
			}
			if (!String(args[0]).startsWith("http://127.0.0.1:"))
				throw new Error("Unexpected network access in scaling test.");
			return originalFetch(...args);
		},
		{ preconnect: originalFetch.preconnect },
	);
	const coordinator = new ShardCoordinator({
		shardCount: 1,
		port: 0,
		botToken: "synthetic-offline-token",
		logger,
		workers: [
			{ id: "a", token: tokenA, shards: [0], maxShards: 2 },
			{ id: "b", token: tokenB, shards: [], maxShards: 2 },
		],
		scaling: {
			maxShards: 4,
			confirmations: 1,
			cooldownMs: 60000,
			drainTimeoutMs: 1000,
			readyTimeoutMs: 15000,
			...scaling,
		},
	});
	const managers: ShardManager[] = [];
	const close = async () => {
		try {
			await Promise.all(managers.map((manager) => manager.close()));
			await coordinator.close();
		} finally {
			globalThis.fetch = originalFetch;
		}
	};
	try {
		await coordinator.start();
		for (const [id, token] of [
			["a", tokenA],
			["b", tokenB],
		]) {
			const manager = new ShardManager({
				id,
				token,
				url: coordinator.url!,
				script: fixture,
				logger,
				restart: false,
				startupTimeoutMs: 8000,
				shutdownTimeoutMs: 500,
				identifyTimeoutMs: 15000,
				reconnect: { initialDelayMs: 50, maxDelayMs: 100 },
				env: {
					SHARD_TEST_MODE: "scaling",
					SHARD_TEST_FAIL_COUNT: failCount?.toString(),
				},
			});
			managers.push(manager);
			await manager.start();
		}
		await until(() => coordinator["gatewayReady"](), 15000);
	} catch (error) {
		await close();
		throw error;
	}
	return {
		coordinator,
		managers,
		metadata,
		close,
		children: () =>
			managers.flatMap((manager) => [...manager["children"].values()]),
		ready: () => until(() => coordinator["gatewayReady"](), 15000),
		allowNext: () =>
			Reflect.set(coordinator["scaling"]!, "changedAt", -Infinity),
	};
}

test("automatic deployment increases and decreases, coalesces triggers, and leaves idle hosts connected", async () => {
	const c = await cluster();
	try {
		expect(c.managers[1].processes).toHaveLength(0);
		const original = c.children();
		// A recommendation increase can repair unready shards without relying on partial guild caches.
		[...c.coordinator["sessions"].values()]
			.find((session) => session.host.id === "a")!
			.metrics.get(0)!.ready = false;
		const send = c.coordinator["safeSend"].bind(c.coordinator);
		c.coordinator["safeSend"] = (session, message) => {
			if (message.op === "assignment")
				for (const child of original)
					expect(child.process.exitCode).not.toBeNull();
			send(session, message);
		};
		c.metadata.shards = 2;
		const pending = c.managers[0].request(0, "slow", { ms: 30000 });
		void pending.catch(() => {});
		await until(() => c.coordinator.pendingCount > 0);
		const requests = c.metadata.requests;
		const first = c.coordinator.checkScaling();
		expect(c.coordinator.checkScaling()).toBe(first);
		expect((await first).reason).toBe("deployed");
		await expect(pending).rejects.toMatchObject({ code: "RESHARDING" });
		expect(c.metadata.requests).toBe(requests + 1);
		expect(c.coordinator.shardCount).toBe(2);
		for (const child of original) expect(child.process.exitCode).not.toBeNull();
		for (const manager of c.managers) expect(manager.shardCount).toBe(2);
		expect(await c.managers[0].request(1, "loginState", null)).toBe(true);
		const started = c.children();
		const allowance = c.coordinator["scheduler"]!.remaining;
		expect((await c.coordinator.checkScaling()).reason).toBe("stable");
		expect(c.children().map((child) => child.process.pid)).toEqual(
			started.map((child) => child.process.pid),
		);
		expect(c.coordinator["scheduler"]!.remaining).toBe(allowance);
		c.metadata.shards = 1;
		expect((await c.coordinator.checkScaling()).reason).toBe("cooldown");
		c.allowNext();
		expect((await c.coordinator.checkScaling()).reason).toBe("deployed");
		expect(c.coordinator.shardCount).toBe(1);
		for (const child of started) expect(child.process.exitCode).not.toBeNull();
		expect(
			c.managers.every(
				(manager) => manager.isConnected && manager.shardCount === 1,
			),
		).toBe(true);
		expect(c.managers.flatMap((manager) => manager.processes)).toHaveLength(1);
		expect(c.coordinator["scheduler"]!.remaining).toBe(96);
	} finally {
		await c.close();
	}
}, 45000);

test("metadata errors, capacity, readiness, stale metrics and exhausted budgets do not interrupt healthy children", async () => {
	const c = await cluster({ sessionReserve: 2 });
	try {
		const original = c.children()[0];
		c.metadata.fail = true;
		expect((await c.coordinator.checkScaling()).reason).toBe("GATEWAY");
		c.metadata.fail = false;
		c.metadata.shards = 0;
		expect((await c.coordinator.checkScaling()).reason).toBe(
			"SCALING_METADATA",
		);
		c.metadata.shards = 5;
		expect((await c.coordinator.checkScaling()).reason).toBe(
			"SCALING_CAPACITY",
		);
		c.metadata.shards = 1;
		const metrics = [...c.coordinator["sessions"].values()]
			.find((session) => session.host.id === "a")!
			.metrics.get(0)!;
		metrics.ready = false;
		expect((await c.coordinator.checkScaling()).reason).toBe(
			"waiting_for_ready_hosts",
		);
		metrics.ready = true;
		metrics.at = performance.now() - 16000;
		expect((await c.coordinator.checkScaling()).reason).toBe(
			"waiting_for_ready_hosts",
		);
		metrics.at = performance.now();
		c.metadata.shards = 2;
		c.metadata.remaining = 3;
		expect((await c.coordinator.checkScaling()).reason).toBe(
			"insufficient_session_starts",
		);
		expect(c.children()[0]).toBe(original);
		expect(original.process.exitCode).toBeNull();
		expect(c.coordinator.pendingCount).toBe(0);
	} finally {
		await c.close();
	}
}, 20000);

test("an unacknowledged drain rolls back only after owned child exits, and late acknowledgements are harmless", async () => {
	const c = await cluster();
	try {
		const original = c.children();
		const receive = c.coordinator["receive"].bind(c.coordinator);
		let late: (() => void) | undefined;
		c.coordinator["receive"] = (session, message) => {
			if (message.op === "drained" && session.host.id === "b") {
				late = () => receive(session, message);
				return;
			}
			receive(session, message);
		};
		c.metadata.shards = 2;
		expect((await c.coordinator.checkScaling()).reason).toBe(
			"SCALING_DRAIN_TIMEOUT",
		);
		expect(c.coordinator.shardCount).toBe(1);
		await c.ready();
		for (const child of original) expect(child.process.exitCode).not.toBeNull();
		expect(late).toBeDefined();
		late!();
		expect(
			c.managers.every(
				(manager) => manager.isConnected && manager.shardCount === 1,
			),
		).toBe(true);
	} finally {
		await c.close();
	}
}, 25000);

test("a disconnect before commit retains the old total and reconnects without ownership files", async () => {
	const c = await cluster();
	try {
		const receive = c.coordinator["receive"].bind(c.coordinator);
		let disconnected = false;
		c.coordinator["receive"] = (session, message) => {
			if (message.op === "drained" && !disconnected) {
				disconnected = true;
				session.socket!.terminate();
				return;
			}
			receive(session, message);
		};
		c.metadata.shards = 2;
		expect((await c.coordinator.checkScaling()).reason).toBe(
			"SCALING_DISCONNECTED",
		);
		expect(c.coordinator.shardCount).toBe(1);
		await c.ready();
		expect(c.managers.every((manager) => manager.shardCount === 1)).toBe(true);
	} finally {
		await c.close();
	}
}, 25000);

test("a disconnect after commit rolls forward on welcome; stale sessions cannot change readiness", async () => {
	const c = await cluster();
	try {
		const stale = [...c.coordinator["sessions"].values()].find(
			(session) => session.host.id === "b",
		)!;
		const send = c.coordinator["safeSend"].bind(c.coordinator);
		let disconnected = false;
		c.coordinator["safeSend"] = (session, message) => {
			if (
				message.op === "assignment" &&
				session.host.id === "b" &&
				!disconnected
			) {
				disconnected = true;
				session.socket!.terminate();
				return;
			}
			send(session, message);
		};
		c.metadata.shards = 2;
		expect((await c.coordinator.checkScaling()).reason).toBe("deployed");
		expect(c.coordinator.shardCount).toBe(2);
		expect(() =>
			c.coordinator["receive"](
				stale,
				frame("metrics", undefined, {
					shard: 1,
					generation: "old",
					ready: true,
					guilds: 1,
				}),
			),
		).toThrow("Stale");
		expect(c.managers.every((manager) => manager.shardCount === 2)).toBe(true);
	} finally {
		await c.close();
	}
}, 25000);

test("failed new children leave a degraded committed topology rather than mixing old totals", async () => {
	const c = await cluster({ readyTimeoutMs: 1000 }, 2);
	try {
		c.metadata.shards = 2;
		const state = await c.coordinator.checkScaling();
		expect(state.phase).toBe("degraded");
		expect(state.reason).toBe("SCALING_READY_TIMEOUT");
		expect(c.coordinator.shardCount).toBe(2);
		expect(c.managers.every((manager) => manager.shardCount === 2)).toBe(true);
		c.allowNext();
		expect((await c.coordinator.checkScaling()).phase).toBe("degraded");
		expect(c.coordinator.shardCount).toBe(2);
	} finally {
		await c.close();
	}
}, 20000);

test("closing during drain cancels the transition and clears pending work and the poll timer", async () => {
	const c = await cluster();
	try {
		const receive = c.coordinator["receive"].bind(c.coordinator);
		c.coordinator["receive"] = (session, message) => {
			if (message.op !== "drained") receive(session, message);
		};
		c.metadata.shards = 2;
		const checking = c.coordinator.checkScaling();
		await until(() => c.coordinator.scalingStatus.phase === "draining");
		await c.coordinator.close();
		await checking;
		expect(c.coordinator.url).toBeUndefined();
		expect(c.coordinator.pendingCount).toBe(0);
		await until(() => c.children().length === 0);
	} finally {
		await c.close();
	}
}, 20000);

test("polling evaluates automatically, reschedules after completion and stops scheduling on close", async () => {
	const coordinator = new ShardCoordinator({
		shardCount: 1,
		botToken: "fake",
		logger,
		workers: [{ id: "a", token: tokenA, shards: [0], maxShards: 2 }],
		scaling: { maxShards: 2, pollIntervalMs: 60000 },
	});
	const scheduled: (() => void)[] = [];
	const timer = spyOn(globalThis, "setTimeout").mockImplementation(((
		callback: () => void,
		ms: number,
	) => {
		expect(ms).toBe(60000);
		scheduled.push(callback);
		return undefined;
	}) as unknown as typeof setTimeout);
	const check = spyOn(coordinator, "checkScaling").mockResolvedValue(
		coordinator.scalingStatus,
	);
	try {
		coordinator["scheduleScaling"]();
		expect(scheduled).toHaveLength(1);
		scheduled[0]();
		await Promise.resolve();
		expect(check).toHaveBeenCalledTimes(1);
		expect(scheduled).toHaveLength(2);
		await coordinator.close();
		coordinator["scheduleScaling"]();
		expect(scheduled).toHaveLength(2);
	} finally {
		timer.mockRestore();
		check.mockRestore();
		await coordinator.close();
	}
});

test("automatic plans validate identify queue capacity and reconnect frame size before draining", async () => {
	const create = (limits = {}) =>
		new ShardCoordinator({
			shardCount: 1,
			botToken: "fake",
			logger,
			limits,
			workers: [{ id: "a", token: tokenA, shards: [0], maxShards: 4096 }],
			scaling: { maxShards: 4096 },
		});
	const plan = {
		count: 300,
		reason: "shard_count",
		assignments: new Map(
			Array.from({ length: 300 }, (_, shard) => [shard, "a"]),
		),
	};
	const capacity = create();
	const bytes = create({ maxPending: 4096, maxBytes: 1024 });
	try {
		expect(() => capacity["validateAssignments"](plan)).toThrow("maxPending");
		expect(() => bytes["validateAssignments"](plan)).toThrow("maxBytes");
		expect(capacity.scalingStatus.phase).toBe("idle");
		expect(bytes.shardCount).toBe(1);
	} finally {
		await capacity.close();
		await bytes.close();
	}
});

test("automatic options are opt-in and protocol metrics are bounded", async () => {
	const fixed = new ShardCoordinator({
		shardCount: 1,
		workers: [{ id: "a", token: tokenA, shards: [0] }],
		sessionStartLimit: sessionLimit,
		logger,
	});
	expect((await fixed.checkScaling()).phase).toBe("disabled");
	expect(
		() =>
			new ShardCoordinator({
				shardCount: 1,
				workers: [],
				sessionStartLimit: sessionLimit,
				scaling: { maxShards: 4 },
			}),
	).toThrow("botToken");
	expect(
		() =>
			new ShardCoordinator({
				shardCount: 1,
				workers: [{ id: "a", token: tokenA, shards: [0] }],
				botToken: "fake",
				scaling: { maxShards: 4 },
			}),
	).toThrow("maxShards");
	for (const guilds of [-1, 1.1, 10000001])
		expect(() =>
			decode(
				JSON.stringify(
					frame("metrics", undefined, {
						shard: 0,
						generation: "test",
						ready: true,
						guilds,
					}),
				),
				1024,
				["metrics"],
			),
		).toThrow();
	await fixed.close();
});
