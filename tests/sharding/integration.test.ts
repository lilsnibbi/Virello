import { describe, expect, test } from "bun:test";
import "./fixtures/contracts";
import { VirelloClient, ShardCoordinator, ShardManager } from "../../src/index";
import { fixture, logger, stack, tokenA, until } from "./helpers";

describe("real loopback coordinator, supervisors and Bun shard processes", () => {
	test("routes concurrent typed requests across two hosts, replies, self calls and broadcasts", async () => {
		const s = await stack();
		try {
			const a = await s.host("a");
			const b = await s.host("b");
			await until(() =>
				s.coordinator.workers.every((w) => w.shards.length === 1),
			);
			const results = await Promise.all(
				Array.from({ length: 30 }, (_, value) =>
					a.request(0, "relay", { target: 1, value }),
				),
			);
			expect(results.map((r) => r.value)).toEqual(
				Array.from({ length: 30 }, (_, i) => i),
			);
			expect(
				results.every(
					(r) => r.source === 0 && r.shard === 1 && r.pid !== process.pid,
				),
			).toBe(true);
			const all = await b.broadcast("probe", { value: 9 });
			expect(all.map((r) => r.ok)).toEqual([true, true]);
			expect(await a.request(0, "all", null)).toEqual([0, 1]);
			expect(
				(await a.request(0, "relay", { target: 0, value: 4 })).source,
			).toBe(0);
			await until(() => s.coordinator.pendingCount === 0);
		} finally {
			await s.close();
		}
	}, 20000);
	test("isolates handler failures, validation, oversized/lossy responses, abort and deadline", async () => {
		const s = await stack();
		try {
			const a = await s.host("a");
			await until(() => a.processes[0]?.state === "running");
			await expect(a.request(0, "fail", null)).rejects.toThrow("Intentional");
			await expect(
				a.request(0, "probe", { value: "bad" } as never),
			).rejects.toThrow();
			await expect(a.request(0, "oversized", null)).rejects.toThrow("maxBytes");
			await expect(a.request(0, "lossy", null)).rejects.toThrow("JSON");
			await expect(
				a.request(0, "slow", { ms: 1000 }, { timeoutMs: 50 }),
			).rejects.toThrow("timed out");
			const controller = new AbortController();
			const call = a.request(
				0,
				"slow",
				{ ms: 1000 },
				{ signal: controller.signal },
			);
			await Bun.sleep(30);
			controller.abort(new Error("stop waiting"));
			await expect(call).rejects.toThrow("stop waiting");
			await until(async () => (await a.request(0, "abortCount", null)) >= 2);
			expect((await a.request(0, "probe", { value: 5 })).value).toBe(5);
			const result = await a.broadcast("probe", { value: 1 });
			expect(result[0].ok).toBe(true);
			expect(result[1].ok).toBe(false);
			await until(() => s.coordinator.pendingCount === 0);
		} finally {
			await s.close();
		}
	}, 15000);
	test("restarts a crashed owned child and respects restart:false", async () => {
		const s = await stack();
		try {
			const a = await s.host("a");
			const b = await s.host("b", { restart: false });
			await until(() => s.coordinator.workers.every((w) => w.shards.length));
			const old = a.processes[0].pid;
			await expect(a.request(0, "crash", null)).rejects.toThrow();
			await until(
				() => a.processes[0]?.state === "running" && a.processes[0].pid !== old,
			);
			expect(a.processes[0].restarts).toBe(1);
			expect((await a.request(0, "probe", { value: 3 })).value).toBe(3);
			await expect(b.request(1, "crash", null)).rejects.toThrow();
			await until(() => b.processes[0]?.state === "failed");
			await Bun.sleep(200);
			expect(b.processes[0].pid).toBeNull();
		} finally {
			await s.close();
		}
	}, 20000);
	test("keeps a shard alive when encoded handler error text exceeds its message limit", async () => {
		const s = await stack({ limits: { maxBytes: 1024 } });
		try {
			const a = await s.host("a", {
				restart: false,
				env: { SHARD_TEST_MODE: "largeError" },
			});
			await until(() => a.processes[0]?.state === "running");
			const pid = a.processes[0].pid;
			await expect(a.request(0, "fail", null)).rejects.toMatchObject({
				code: "HANDLER",
			});
			expect((await a.request(0, "probe", { value: 7 })).value).toBe(7);
			expect(a.processes[0].pid).toBe(pid);
		} finally {
			await s.close();
		}
	}, 10000);
	test("bounds repeated crashes and kills a child that never boots", async () => {
		const s = await stack();
		try {
			const a = await s.host("a", {
				env: { SHARD_TEST_MODE: "exit" },
				restart: { maxRestarts: 2, initialDelayMs: 80, maxDelayMs: 160 },
			});
			const b = await s.host("b", {
				env: { SHARD_TEST_MODE: "noBoot" },
				startupTimeoutMs: 250,
				restart: false,
				shutdownTimeoutMs: 100,
			});
			await until(
				() =>
					a.processes[0]?.state === "failed" &&
					b.processes[0]?.state === "failed",
			);
			expect(a.processes[0].restarts).toBe(2);
			expect(b.processes[0].pid).toBeNull();
		} finally {
			await s.close();
		}
	}, 10000);
	test("rejects wrong tokens and keeps a new instance dormant until graceful release", async () => {
		const s = await stack();
		try {
			const wrong = new ShardManager({
				id: "a",
				url: s.coordinator.url!,
				token: "incorrect-test-placeholder-0000000000",
				script: fixture,
				logger,
			});
			await expect(wrong.start()).rejects.toThrow();
			await wrong.close();
			const a = await s.host("a");
			await until(() => a.processes[0]?.state === "running");
			const duplicate = new ShardManager({
				id: "a",
				url: s.coordinator.url!,
				token: tokenA,
				script: fixture,
				logger,
				reconnect: false,
			});
			s.managers.push(duplicate);
			await duplicate.start();
			await until(() => duplicate.processes[0]?.state === "dormant");
			expect(duplicate.processes[0].shard).toBeNull();
			await duplicate.close();
			await a.close();
			const replacement = await s.host("a");
			await until(() => replacement.processes[0]?.state === "running");
		} finally {
			await s.close();
		}
	}, 15000);
	test("reconciles after coordinator restart while preserving its existing child", async () => {
		const s = await stack();
		let replacement: ShardCoordinator | undefined;
		try {
			const a = await s.host("a");
			await until(() => a.processes[0]?.state === "running");
			const old = a.processes[0].pid;
			const port = Number(new URL(s.coordinator.url!).port);
			await s.coordinator.close();
			await until(() => !a.isConnected);
			replacement = new ShardCoordinator({ ...s.base, port });
			await replacement.start();
			await until(
				() =>
					a.isConnected &&
					a.processes[0]?.state === "running" &&
					a.processes[0].pid === old,
			);
			expect((await a.request(0, "probe", { value: 6 })).value).toBe(6);
			await a.close();
		} finally {
			await replacement?.close();
			await s.close();
		}
	}, 20000);
	test("one client per process remains enforced and no transport starts by default", async () => {
		const client = new VirelloClient({ intents: [], logger });
		try {
			expect(client.sharding.enabled).toBe(false);
			expect(client.sharding.isConnected).toBe(false);
			expect(() => new VirelloClient({ intents: [], logger })).toThrow(
				"Only one",
			);
			await expect(client.sharding.connect()).rejects.toThrow(
				"not a ShardManager",
			);
		} finally {
			await client.destroy();
		}
	});
	test("shutdown rejects pending calls, confirms owned exits and is idempotent", async () => {
		const s = await stack();
		try {
			const a = await s.host("a");
			await until(() => a.processes[0]?.state === "running");
			const call = a.request(0, "slow", { ms: 10000 });
			const rejected = call.catch((error: unknown) => error);
			await Bun.sleep(30);
			const closing = a.close();
			expect(a.close()).toBe(closing);
			await closing;
			expect(await rejected).toBeInstanceOf(Error);
			expect(a.processes[0].pid).toBeNull();
			expect(s.coordinator.pendingCount).toBe(0);
			await expect(a.start()).rejects.toThrow("closed");
		} finally {
			await s.close();
		}
	}, 10000);
	test("reconnect:false stops local children without starting them after coordinator recovery", async () => {
		const s = await stack();
		let replacement: ShardCoordinator | undefined;
		try {
			const a = await s.host("a", { reconnect: false });
			await until(() => a.processes[0]?.state === "running");
			const port = Number(new URL(s.coordinator.url!).port);
			await s.coordinator.close();
			await until(() => a.processes[0]?.pid === null);
			replacement = new ShardCoordinator({ ...s.base, port });
			await replacement.start();
			await Bun.sleep(250);
			expect(a.isConnected).toBe(false);
			expect(a.processes[0].pid).toBeNull();
		} finally {
			await replacement?.close();
			await s.close();
		}
	}, 10000);
	test("keeps timed-out non-cooperative handlers counted against the worker limit", async () => {
		const s = await stack({ limits: { maxPending: 1 } });
		try {
			const a = await s.host("a");
			await until(() => a.processes[0]?.state === "running");
			await expect(
				a.request(0, "hung", null, { timeoutMs: 60 }),
			).rejects.toThrow("timed out");
			await until(() => s.coordinator.pendingCount === 0);
			await expect(a.request(0, "probe", { value: 1 })).rejects.toThrow(
				"capacity",
			);
		} finally {
			await s.close();
		}
	}, 10000);
	test("terminates an unresponsive owned child after the heartbeat deadline", async () => {
		const s = await stack();
		try {
			const a = await s.host("a", {
				env: { SHARD_TEST_MODE: "wedged" },
				restart: false,
			});
			await until(() => a.processes[0]?.state === "running");
			await until(() => a.processes[0]?.state === "failed", 21000);
			expect(a.processes[0].pid).toBeNull();
		} finally {
			await s.close();
		}
	}, 25000);
});
