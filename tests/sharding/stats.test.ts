import { expect, test } from "bun:test";
import "./fixtures/contracts";
import {
	container,
	VirelloClient,
	ShardCoordinator,
	ShardError,
	type ShardStats,
} from "../../src/index";
import { ShardLink } from "../../src/sharding/client/Link";
import { ShardMessenger } from "../../src/sharding/messaging";
import {
	statsMap,
	statsRequest,
	statsSnapshot,
} from "../../src/sharding/stats";
import type { ShardCallOptions } from "../../src/sharding/types";
import { logger, stack, until } from "./helpers";

const fixture = new URL("./fixtures/stats.ts", import.meta.url);
const sample: ShardStats = {
	sampledAt: 123,
	ready: true,
	guilds: 4,
	users: 5,
	channels: 6,
	pingMs: 12,
	uptimeMs: 34,
	pid: 1,
	processUptimeMs: 56,
	memory: {
		rss: 100,
		heapTotal: 80,
		heapUsed: 60,
		external: 20,
		arrayBuffers: 10,
	},
};

test("stats snapshots are detached and the map exposes no mutable backing storage", () => {
	const input = structuredClone(sample);
	const value = statsSnapshot(input);
	const result = Object.freeze({ shard: 0, ok: true as const, value });
	const results = [result];
	const map = statsMap(results);
	Reflect.set(input.memory, "rss", 999);
	results.length = 0;
	expect(value.memory.rss).toBe(100);
	expect(Object.isFrozen(value)).toBe(true);
	expect(Object.isFrozen(value.memory)).toBe(true);
	expect(Object.isFrozen(map)).toBe(true);
	expect(Reflect.set(value, "guilds", 999)).toBe(false);
	expect(Reflect.set(value.memory, "rss", 999)).toBe(false);
	for (const name of ["set", "delete", "clear"])
		expect(Reflect.get(map, name)).toBeUndefined();
	expect(() => Map.prototype.set.call(map, 1, result)).toThrow();
	expect(map.size).toBe(1);
	expect(map.has(0)).toBe(true);
	expect(map.get(1)).toBeUndefined();
	expect([...map.keys()]).toEqual([0]);
	expect([...map.values()]).toEqual([result]);
	expect([...map.entries()]).toEqual([[0, result]]);
	expect([...map]).toEqual([[0, result]]);
	const context = {};
	map.forEach(function (this: object, entry, shard, seen) {
		expect(this).toBe(context);
		expect(entry).toBe(result);
		expect(shard).toBe(0);
		expect(seen).toBe(map);
	}, context);
});

test("invalid or incomplete stats never turn into invented metrics", () => {
	for (const value of [
		null,
		{},
		{ ...sample, ready: "yes" },
		{ ...sample, memory: { ...sample.memory, rss: -1 } },
		{ ...sample, extra: 1 },
		{ ...sample, memory: { ...sample.memory, extra: 1 } },
	]) {
		expect(() => statsSnapshot(value)).toThrow(ShardError);
	}
});

class StatsCaller extends ShardMessenger {
	public constructor(
		public readonly shardCount: number,
		private readonly run: (
			target: number,
			name: string,
			options: ShardCallOptions,
		) => Promise<unknown>,
	) {
		super();
	}
	protected override call(
		target: number,
		name: string,
		_payload: unknown,
		options: ShardCallOptions,
	): Promise<unknown> {
		return this.run(target, name, options);
	}
}

test("stats bounds fan-out to eight requests and preserves ID order across out-of-order replies", async () => {
	let active = 0;
	let maximum = 0;
	const called: number[] = [];
	const caller = new StatsCaller(12, async (target, name) => {
		expect(name).toBe(statsRequest);
		called.push(target);
		maximum = Math.max(maximum, ++active);
		await Bun.sleep(target === 0 ? 30 : 2);
		active--;
		return { ...sample, guilds: target };
	});
	const all = await caller.stats(undefined, { timeoutMs: 1000 });
	expect(maximum).toBe(8);
	expect(called).toEqual(Array.from({ length: 12 }, (_, index) => index));
	expect([...all.keys()]).toEqual(called);
	expect(all.get(9)).toMatchObject({ ok: true, value: { guilds: 9 } });
	expect(Object.isFrozen(all.get(9))).toBe(true);
	const one = await caller.stats(0);
	expect([...one.keys()]).toEqual([0]);
	expect(called).toHaveLength(13);
});

test("one shared stats deadline bounds queued targets and late successes cannot sneak through", async () => {
	const called: number[] = [];
	const caller = new StatsCaller(12, async (target) => {
		called.push(target);
		await Bun.sleep(50);
		return sample;
	});
	const result = await caller.stats(undefined, { timeoutMs: 20 });
	expect(called).toHaveLength(8);
	expect(result.size).toBe(12);
	for (const entry of result.values()) {
		expect(entry).toMatchObject({ ok: false, error: { code: "TIMEOUT" } });
		expect("value" in entry).toBe(false);
	}
});

test("stats errors are detached, frozen ShardErrors and aborted collection sends no queued requests", async () => {
	const original = new ShardError("UNAVAILABLE", "missing");
	const caller = new StatsCaller(1, async () => {
		throw original;
	});
	const entry = (await caller.stats(0)).get(0)!;
	expect(entry.ok).toBe(false);
	if (entry.ok) throw new Error("Expected failure.");
	expect(entry.error).toBeInstanceOf(ShardError);
	expect(entry.error).not.toBe(original);
	expect(Object.isFrozen(entry)).toBe(true);
	expect(Object.isFrozen(entry.error)).toBe(true);
	original.message = "changed";
	expect(entry.error.message).toBe("missing");
	const controller = new AbortController();
	let calls = 0;
	const cancelling = new StatsCaller(12, async () => {
		calls++;
		controller.abort();
		throw new Error("cancelled");
	});
	const result = await cancelling.stats(undefined, {
		signal: controller.signal,
	});
	expect(calls).toBe(1);
	for (const item of result.values())
		expect(item).toMatchObject({ ok: false, error: { code: "ABORTED" } });
});

test("built-in stats cannot be replaced by an application handler", async () => {
	const link = new ShardLink(undefined, async () => {});
	try {
		expect(() =>
			link.handle(statsRequest as never, () => null as never),
		).toThrow("cannot be replaced");
	} finally {
		await link.close();
	}
});

test("fresh stats travel through the coordinator for hosts, shards and self requests", async () => {
	const s = await stack();
	try {
		const a = await s.host("a", { script: fixture });
		const b = await s.host("b", { script: fixture });
		await until(
			() =>
				a.processes[0]?.state === "running" &&
				b.processes[0]?.state === "running",
		);
		await a.request(0, "statsUpdate", { guilds: 3, ready: true });
		await a.request(1, "statsUpdate", { guilds: 7, ready: false });
		const routed: { source: number; target: number }[] = [];
		const route = s.coordinator["route"].bind(s.coordinator);
		s.coordinator["route"] = (session, message) => {
			if (message.data.name === statsRequest)
				routed.push({
					source: message.data.source,
					target: message.data.target,
				});
			route(session, message);
		};
		// Periodic scaling metrics deliberately disagree. Stats must ask the processes instead.
		for (const session of s.coordinator["sessions"].values())
			for (const shard of session.ready.keys())
				session.metrics.set(shard, {
					ready: false,
					guilds: 999,
					at: performance.now(),
				});
		const started = Date.now();
		const first = await a.stats();
		expect([...first.keys()]).toEqual([0, 1]);
		expect(first.get(0)).toMatchObject({
			ok: true,
			value: { guilds: 3, ready: true, pid: a.processes[0].pid },
		});
		expect(first.get(1)).toMatchObject({
			ok: true,
			value: { guilds: 7, ready: false, pingMs: null, uptimeMs: null },
		});
		for (const result of first.values()) {
			if (!result.ok) throw result.error;
			expect(result.value.sampledAt).toBeGreaterThanOrEqual(started);
			expect(result.value.processUptimeMs).toBeGreaterThan(0);
			expect(result.value.memory.rss).toBeGreaterThan(0);
		}
		expect(await a.request(0, "statsSamples", null)).toBe(1);
		expect(await a.request(1, "statsSamples", null)).toBe(1);
		await a.request(0, "statsUpdate", { guilds: 12, ready: false });
		const single = await a.stats(0);
		expect([...single.keys()]).toEqual([0]);
		expect(single.get(0)).toMatchObject({
			ok: true,
			value: { guilds: 12, ready: false },
		});
		expect(first.get(0)).toMatchObject({
			ok: true,
			value: { guilds: 3, ready: true },
		});
		expect(await a.request(1, "statsSamples", null)).toBe(1);
		const relayed = await a.request(0, "statsRead", { shard: null });
		expect(relayed.map(([id]) => id)).toEqual([0, 1]);
		expect(relayed[0][1]).toMatchObject({ ok: true, value: { guilds: 12 } });
		expect(relayed[1][1]).toMatchObject({ ok: true, value: { guilds: 7 } });
		expect(await a.request(0, "statsSamples", null)).toBe(3);
		expect(await a.request(1, "statsSamples", null)).toBe(2);
		expect(routed).toEqual([
			{ source: -1, target: 0 },
			{ source: -1, target: 1 },
			{ source: -1, target: 0 },
			{ source: 0, target: 0 },
			{ source: 0, target: 1 },
		]);
		const concurrent = await Promise.all([a.stats(0), a.stats(0)]);
		expect(concurrent[0].get(0)).not.toBe(concurrent[1].get(0));
		expect(await a.request(0, "statsSamples", null)).toBe(5);
		await until(() => s.coordinator.pendingCount === 0);
	} finally {
		await s.close();
	}
}, 15000);

test("unavailable, timed-out and malformed shards have explicit failures and no last-known sample", async () => {
	const s = await stack({ limits: { maxBytes: 1024 } });
	try {
		const a = await s.host("a", { script: fixture });
		await until(() => a.processes[0]?.state === "running");
		expect((await a.stats()).get(1)).toMatchObject({
			ok: false,
			error: { code: "UNAVAILABLE" },
		});
		const b = await s.host("b", { script: fixture });
		await until(() => b.processes[0]?.state === "running");
		await a.request(1, "statsUpdate", { guilds: 2, ready: true });
		expect((await a.stats(1)).get(1)).toMatchObject({
			ok: true,
			value: { guilds: 2 },
		});
		await a.request(1, "statsUpdate", {
			guilds: 9,
			ready: false,
			delayMs: 300,
		});
		const partial = await a.stats(undefined, { timeoutMs: 80 });
		expect(partial.get(0)?.ok).toBe(true);
		expect(partial.get(1)).toMatchObject({
			ok: false,
			error: { code: "TIMEOUT" },
		});
		expect("value" in partial.get(1)!).toBe(false);
		await until(() => s.coordinator.pendingCount === 0);
		// This reply arrives after the late stats reply; neither can alter the completed map.
		await a.request(1, "statsSamples", null);
		expect(partial.get(1)?.ok).toBe(false);
		await a.request(1, "statsUpdate", {
			guilds: 10,
			ready: true,
			invalid: true,
		});
		expect((await a.stats(1)).get(1)).toMatchObject({
			ok: false,
			error: { code: "PROTOCOL" },
		});
		await a.request(1, "statsUpdate", { guilds: 11, ready: true });
		expect((await a.stats(1)).get(1)).toMatchObject({
			ok: true,
			value: { guilds: 11 },
		});
		await b.close();
		const missing = (await a.stats(1)).get(1)!;
		expect(missing).toMatchObject({
			ok: false,
			error: { code: "UNAVAILABLE" },
		});
		expect("value" in missing).toBe(false);
		await until(() => s.coordinator.pendingCount === 0);
	} finally {
		await s.close();
	}
}, 15000);

test("stats honors coordinator default timeouts, request capacity and caller cancellation", async () => {
	const s = await stack({ limits: { timeoutMs: 100, maxPending: 1 } });
	try {
		const a = await s.host("a", { script: fixture });
		await until(() => a.processes[0]?.state === "running");
		await a.request(0, "statsUpdate", { guilds: 4, ready: true, delayMs: 300 });
		const timedOut = await a.stats(0);
		expect(timedOut.get(0)).toMatchObject({
			ok: false,
			error: { code: "TIMEOUT" },
		});
		await a.request(0, "statsSamples", null, { timeoutMs: 1000 });
		await until(() => s.coordinator.pendingCount === 0);
		const controller = new AbortController();
		const pending = a.stats(0, { timeoutMs: 1000, signal: controller.signal });
		await until(() => s.coordinator.pendingCount === 1);
		expect((await a.stats(0)).get(0)).toMatchObject({
			ok: false,
			error: { code: "CAPACITY" },
		});
		controller.abort(new Error("stop stats"));
		expect((await pending).get(0)).toMatchObject({
			ok: false,
			error: { code: "ABORTED" },
		});
		await until(() => s.coordinator.pendingCount === 0);
		await a.request(
			0,
			"statsUpdate",
			{ guilds: 8, ready: true },
			{ timeoutMs: 1000 },
		);
		expect((await a.stats(0)).get(0)).toMatchObject({
			ok: true,
			value: { guilds: 8 },
		});
		for (const shard of [-1, 0.5, 2, NaN, Infinity])
			await expect(a.stats(shard)).rejects.toMatchObject({ code: "TARGET" });
		await expect(a.stats(0, { timeoutMs: 0 })).rejects.toMatchObject({
			code: "CONFIG",
		});
	} finally {
		await s.close();
	}
}, 15000);

test("stats fails during maintenance and returns fresh data after reconciliation without restarting the child", async () => {
	const s = await stack();
	let replacement: ShardCoordinator | undefined;
	try {
		const a = await s.host("a", { script: fixture });
		await until(() => a.processes[0]?.state === "running");
		const pid = a.processes[0].pid;
		await a.request(0, "statsUpdate", { guilds: 5, ready: true });
		expect((await a.stats(0)).get(0)?.ok).toBe(true);
		const port = Number(new URL(s.coordinator.url!).port);
		await a.request(0, "statsUpdate", { guilds: 5, ready: true, delayMs: 300 });
		const inFlight = a.stats(0, { timeoutMs: 1000 });
		await until(() => s.coordinator.pendingCount === 1);
		await s.coordinator.close();
		expect((await inFlight).get(0)).toMatchObject({
			ok: false,
			error: { code: "DISCONNECTED" },
		});
		await until(() => !a.isConnected);
		await expect(a.stats()).rejects.toMatchObject({ code: "DISCONNECTED" });
		await expect(
			a.stats(0, { waitForCoordinator: true, timeoutMs: 30 }),
		).rejects.toMatchObject({ code: "TIMEOUT" });
		const waiting = a.stats(0, { waitForCoordinator: true, timeoutMs: 5000 });
		replacement = new ShardCoordinator({ ...s.base, port });
		await replacement.start();
		// Host connectivity can precede child reconciliation, so either a fresh sample or explicit unavailability is valid here.
		const recovered = (await waiting).get(0)!;
		if (!recovered.ok) expect(recovered.error.code).toBe("UNAVAILABLE");
		await until(() => a.processes[0]?.state === "running");
		expect((await a.stats(0)).get(0)).toMatchObject({
			ok: true,
			value: { guilds: 5, pid },
		});
		expect(a.processes[0].pid).toBe(pid);
		await a.close();
		await expect(a.stats(0)).rejects.toMatchObject({ code: "CLOSED" });
	} finally {
		await replacement?.close();
		await s.close();
	}
}, 15000);

test("container.sharding follows the active client and unmanaged clients cannot return local fallback stats", async () => {
	for (let attempt = 0; attempt < 2; attempt++) {
		const client = new VirelloClient({ intents: [], logger });
		try {
			expect(container.sharding).toBe(client.sharding);
			expect(Reflect.set(container, "sharding", {})).toBe(false);
			await expect(container.sharding.stats()).rejects.toMatchObject({
				code: "DISCONNECTED",
			});
		} finally {
			await client.destroy();
		}
	}
});
