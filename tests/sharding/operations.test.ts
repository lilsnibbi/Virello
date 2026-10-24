import { describe, expect, test } from "bun:test";
import "./fixtures/contracts";
import {
	calculateShardId,
	ShardError,
	ShardManager,
	type ShardRestartStatus,
} from "virello/sharding";
import { ShardLink } from "../../packages/sharding/src/client/Link";
import { ShardLifecycle } from "../../packages/sharding/src/lifecycle";
import {
	frame,
	limits,
	type Frame,
} from "../../packages/sharding/src/transport/protocol";
import { fixture, logger, stack, tokenA, until } from "./helpers";

const operationFixture = new URL("./fixtures/operations.ts", import.meta.url);
const singleHost = () =>
	stack({
		shardCount: 2,
		workers: [{ id: "a", token: tokenA, shards: [0, 1] }],
	});
const running = (manager: ShardManager) =>
	manager.processes.length === 2 &&
	manager.processes.every(({ state }) => state === "running");

describe("guild-targeted requests", () => {
	test("routes snowflakes exactly and rejects invalid snowflakes or totals", () => {
		expect(calculateShardId("4194304", 2)).toBe(1);
		expect(calculateShardId("8388608", 2)).toBe(0);
		expect(calculateShardId("8388608", 3)).toBe(2);
		expect(calculateShardId("18446744073709551615", 4096)).toBe(4095);
		for (const guild of ["", "0", "-1", "01", "1e10", "18446744073709551616"])
			expect(() => calculateShardId(guild, 2)).toThrow(ShardError);
		for (const count of [0, -1, 1.5, NaN, 4097])
			expect(() => calculateShardId("4194304", count)).toThrow(ShardError);
	});

	test("both transports resolve the total after a coordinator wait", async () => {
		const config = {
			shard: 0,
			count: 2,
			generation: "routing-generation",
			limits: limits(),
			identifyTimeoutMs: 1000,
			shutdownTimeoutMs: 1000,
		};
		const link = new ShardLink(config, async () => {});
		const manager = new ShardManager({
			id: "a",
			url: "ws://127.0.0.1:1/sharding",
			token: tokenA,
			script: fixture,
			logger,
		});
		try {
			for (const caller of [manager, link]) {
				Reflect.set(caller, "connected", true);
				if (caller === manager) Reflect.set(manager, "count", 2);
				const calls: Frame<"call">[] = [];
				const rpc =
					caller instanceof ShardManager
						? caller["rpc"].bind(caller)
						: caller["rpc"].bind(caller);
				const availability =
					caller instanceof ShardManager
						? caller["availability"]
						: caller["availability"];
				Reflect.set(caller, "rpc", async (message: Frame<"call">) => {
					calls.push(message);
					return { shard: message.data.target };
				});
				try {
					const pending = caller.requestGuild(
						"8388608",
						"probe",
						{ value: 1 },
						{ waitForCoordinator: true, timeoutMs: 1000 },
					);
					expect(calls).toHaveLength(0);
					if (caller === manager) Reflect.set(manager, "count", 3);
					else config.count = 3;
					availability.set(true);
					expect(await pending).toMatchObject({ shard: 2 });
					expect(calls).toHaveLength(1);
					expect(calls[0].data.timeoutMs).toBeLessThanOrEqual(1000);
				} finally {
					Reflect.set(caller, "rpc", rpc);
					Reflect.set(caller, "connected", false);
				}
			}
		} finally {
			await manager.close();
			await link.close();
		}
	});

	test("routes host and child guild calls through the real coordinator and exposes safe status", async () => {
		const s = await singleHost();
		try {
			const manager = await s.host("a", { script: operationFixture });
			await until(
				() =>
					running(manager) &&
					manager.status.processes.every((process) => process.gatewayReady),
			);
			expect(
				await manager.requestGuild("4194304", "probe", { value: 7 }),
			).toMatchObject({ shard: 1, source: null, value: 7 });
			expect(
				await manager.request(0, "guildRelay", {
					guildId: "4194304",
					value: 8,
				}),
			).toMatchObject({ shard: 1, source: 0, value: 8 });
			const info = await manager.request(0, "operationInfo", null);
			expect(info.status).toMatchObject({
				enabled: true,
				connected: true,
				shard: 0,
				shardCount: 2,
			});
			expect(info.transitions.some((status) => !status.connected)).toBe(true);
			expect(info.transitions.some((status) => status.connected)).toBe(true);
			const before = manager.status;
			expect(Object.isFrozen(before.processes[0])).toBe(true);
			expect(Reflect.set(before.processes[0], "state", "failed")).toBe(false);
			const control = s.coordinator.status;
			expect(control.leasedShards).toEqual([0, 1]);
			expect(control.gatewayReadyShards).toEqual([0, 1]);
			expect(Object.isFrozen(control.workers[0].shards)).toBe(true);
			expect(JSON.stringify(control)).not.toContain(tokenA);
			await manager.close();
			expect(manager.status.closed).toBe(true);
			expect(before.closed).toBe(false);
		} finally {
			await s.close();
		}
	}, 10000);
});

test("lifecycle delivery is deferred, frozen, isolated and unsubscribable through closure", async () => {
	class Events extends ShardLifecycle<{ value: { state: string } }> {
		readonly errors: unknown[] = [];
		protected override lifecycleListenerError(error: unknown): void {
			this.errors.push(error);
		}
		emit(state: string) {
			this.publishLifecycle({ value: { state } });
		}
		close() {
			this.closeLifecycle({ value: { state: "closed" } });
		}
	}
	const source = new Events();
	const seen: string[] = [];
	const unsubscribe = source.onLifecycle((event) => {
		expect(Object.isFrozen(event.value)).toBe(true);
		seen.push(event.value.state);
	});
	const stopThrowing = source.onLifecycle(() => {
		throw new Error("sync observer");
	});
	const stopRejecting = source.onLifecycle(async () => {
		throw new Error("async observer");
	});
	source.emit("ready");
	expect(seen).toEqual([]);
	await Bun.sleep(0);
	expect(seen).toEqual(["ready"]);
	expect(source.errors).toHaveLength(2);
	stopThrowing();
	stopRejecting();
	source.close();
	await Bun.sleep(0);
	expect(seen).toEqual(["ready", "closed"]);
	expect(() => source.onLifecycle(() => {})).toThrow("closed");
	unsubscribe();
	source.emit("ignored");
	await Bun.sleep(0);
	expect(seen).toHaveLength(2);
});

describe("controlled local restarts", () => {
	test("restarts slots sequentially, awaits readiness and preserves observable progress", async () => {
		const s = await singleHost();
		try {
			const manager = await s.host("a", { script: operationFixture });
			await until(() => running(manager));
			const old = manager.processes.map(({ pid }) => pid);
			const progress: ShardRestartStatus[] = [];
			let secondUnchanged = false;
			manager.onLifecycle((event) => {
				if (event.type !== "restart") return;
				progress.push(event.status);
				if (event.status.phase === "waiting" && event.status.currentSlot === 0)
					secondUnchanged = manager.processes[1].pid === old[1];
			});
			const replacements = await manager.restartAll({
				timeoutMs: 8000,
				stabilityMs: 50,
			});
			expect(replacements.map(({ slot }) => slot)).toEqual([0, 1]);
			expect(replacements.every(({ pid }, index) => pid !== old[index])).toBe(
				true,
			);
			expect(secondUnchanged).toBe(true);
			expect(
				manager.status.processes.every((process) => process.gatewayReady),
			).toBe(true);
			expect(manager.status.restart).toMatchObject({
				phase: "completed",
				completed: [0, 1],
				currentSlot: null,
			});
			expect(
				progress
					.filter(({ currentSlot }) => currentSlot === 0)
					.map(({ phase }) => phase),
			).toEqual(["draining", "releasing", "starting", "waiting"]);
			expect(Object.isFrozen(progress[0].completed)).toBe(true);
			expect(progress[0].completed).toEqual([]);
		} finally {
			await s.close();
		}
	}, 12000);

	test("rejects concurrent restarts and cancellation prevents the next slot from starting", async () => {
		const s = await singleHost();
		try {
			const manager = await s.host("a", { script: operationFixture });
			await until(() => running(manager));
			const secondPid = manager.processes[1].pid;
			const controller = new AbortController();
			const unsubscribe = manager.onLifecycle((event) => {
				if (event.type === "restart" && event.status.phase === "waiting")
					controller.abort();
			});
			const pending = manager.restartProcesses([0, 1], {
				signal: controller.signal,
				timeoutMs: 5000,
			});
			const result = pending.catch((error) => error);
			await expect(manager.restartProcess(1)).rejects.toMatchObject({
				code: "BUSY",
			});
			expect(await result).toMatchObject({ code: "ABORTED" });
			expect(manager.processes[1].pid).toBe(secondPid);
			expect(manager.status.restart).toMatchObject({
				phase: "failed",
				currentSlot: 0,
				completed: [],
				error: { code: "ABORTED" },
			});
			unsubscribe();
		} finally {
			await s.close();
		}
	}, 10000);

	test("waits for gateway metrics rather than treating reconciliation as ready", async () => {
		const s = await singleHost();
		try {
			const manager = await s.host("a", {
				script: operationFixture,
				env: { SHARD_TEST_READY: "false" },
			});
			await until(() => running(manager));
			const old = manager.processes[0].pid;
			let settled = false;
			const restart = manager
				.restartProcess(0, { timeoutMs: 8000, stabilityMs: 50 })
				.finally(() => {
					settled = true;
				});
			void restart.catch(() => {});
			await until(() => running(manager) && manager.processes[0].pid !== old);
			expect(settled).toBe(false);
			expect(manager.status.processes[0].gatewayReady).toBe(false);
			await manager.request(0, "operationReady", true);
			const replacement = await restart;
			expect(replacement.state).toBe("running");
			expect(manager.status.processes[0].gatewayReady).toBe(true);
		} finally {
			await s.close();
		}
	}, 12000);

	test("times out readiness without restarting later slots and supports reconciliation-only completion", async () => {
		const s = await singleHost();
		try {
			const manager = await s.host("a", {
				script: operationFixture,
				env: { SHARD_TEST_READY: "false" },
			});
			await until(() => running(manager));
			const secondPid = manager.processes[1].pid;
			await expect(
				manager.restartProcesses([0, 1], { timeoutMs: 1000 }),
			).rejects.toMatchObject({ code: "TIMEOUT" });
			expect(manager.processes[1].pid).toBe(secondPid);
			expect(manager.status.restart?.phase).toBe("failed");
			const replacement = await manager.restartProcess(0, {
				waitForReady: false,
				timeoutMs: 5000,
			});
			expect(replacement.state).toBe("running");
			expect(manager.status.processes[0].gatewayReady).toBe(false);
		} finally {
			await s.close();
		}
	}, 10000);

	test("never spawns a replacement after unconfirmed exit or lease release", async () => {
		const s = await singleHost();
		try {
			const manager = await s.host("a", { script: operationFixture });
			await until(() => running(manager));
			const oldPid = manager.processes[0].pid;
			const stopChild = manager["stopChild"].bind(manager);
			Reflect.set(manager, "stopChild", async () => {
				throw new ShardError("SHUTDOWN_TIMEOUT", "unconfirmed exit");
			});
			try {
				await expect(manager.restartProcess(0)).rejects.toMatchObject({
					code: "SHUTDOWN_TIMEOUT",
				});
				expect(manager.processes[0].pid).toBe(oldPid);
			} finally {
				Reflect.set(manager, "stopChild", stopChild);
			}
			const release = manager["flushReleases"].bind(manager);
			Reflect.set(manager, "flushReleases", async () => {
				throw new ShardError("OWNERSHIP", "unconfirmed release");
			});
			try {
				await expect(manager.restartProcess(0)).rejects.toMatchObject({
					code: "OWNERSHIP",
				});
				expect(manager.processes[0].pid).toBeNull();
				expect(s.coordinator.status.leasedShards).toContain(0);
				expect(manager.status.restart?.completed).toEqual([]);
			} finally {
				Reflect.set(manager, "flushReleases", release);
			}
		} finally {
			await s.close();
		}
	}, 10000);

	test.each(["disconnect", "topology"] as const)(
		"%s aborts an active manual operation",
		async (mode) => {
			const s = await singleHost();
			try {
				const manager = await s.host("a", {
					script: operationFixture,
					env: { SHARD_TEST_READY: "false" },
				});
				await until(() => running(manager));
				const pending = manager.restartProcesses([0, 1], { timeoutMs: 8000 });
				const result = pending.catch((error) => error);
				await until(() => manager.status.restart?.phase === "waiting");
				if (mode === "disconnect") await s.coordinator.close();
				else {
					const session = [...s.coordinator["sessions"].values()][0];
					s.coordinator["send"](session, frame("drain", "test-topology"));
				}
				expect(await result).toMatchObject({
					code: mode === "disconnect" ? "DISCONNECTED" : "RESHARDING",
				});
				expect(manager.status.restart?.completed).toEqual([]);
			} finally {
				await s.close();
			}
		},
		12000,
	);
});
