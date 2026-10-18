import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import "./fixtures/contracts";
import { Pending } from "../../src/sharding/transport/pending";
import { stack, tokenA, tokenB, until } from "./helpers";

async function host(id: "a" | "b", url: string) {
	const pending = new Pending(32);
	const started = pending.create("started", 10000);
	const child = Bun.spawn(
		[
			process.execPath,
			fileURLToPath(new URL("./fixtures/host.ts", import.meta.url)),
		],
		{
			env: {
				...process.env,
				SHARD_TEST_ID: id,
				SHARD_TEST_URL: url,
				SHARD_TEST_TOKEN: id === "a" ? tokenA : tokenB,
			},
			stdin: "ignore",
			stdout: "inherit",
			stderr: "inherit",
			serialization: "json",
			windowsHide: true,
			ipc(input) {
				const reply = input as {
					id: string;
					ok: boolean;
					value: unknown;
					message?: string;
				};
				if (reply.ok) pending.resolve(reply.id, reply.value);
				else pending.reject(reply.id, new Error(reply.message));
			},
		},
	);
	let exited = false;
	void child.exited.then(() => {
		exited = true;
		pending.close();
	});
	await started;
	return {
		child,
		async call(op: "probe" | "relay" | "info", shard = 0, value = 0) {
			const id = crypto.randomUUID();
			const promise = pending.create(id, 5000);
			child.send({ id, op, shard, value });
			return promise;
		},
		async close() {
			if (!exited) {
				try {
					child.send({ id: "close", op: "close" });
				} catch {
					/* Exit may race cleanup. */
				}
				await until(() => exited, 8000).catch(() => child.kill(9));
			}
			await child.exited;
			pending.close();
		},
	};
}
function alive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
describe("independent host supervisor processes over the network transport", () => {
	test("routes across separate supervisors and reserves leases after an unconfirmed supervisor loss", async () => {
		const s = await stack();
		const hosts: Awaited<ReturnType<typeof host>>[] = [];
		try {
			const a = await host("a", s.coordinator.url!);
			const b = await host("b", s.coordinator.url!);
			hosts.push(a, b);
			await until(() =>
				s.coordinator.workers.every((w) => w.shards.length === 1),
			);
			const reply = await a.call("relay", 0, 47);
			expect(reply).toMatchObject({ value: 47, source: 0, shard: 1 });
			const oldPid = ((await a.call("info")) as { pid: number }[])[0].pid;
			expect(alive(oldPid)).toBe(true);
			a.child.kill(9);
			await a.child.exited;
			await until(() => !alive(oldPid), 20000);
			await expect(b.call("probe", 0)).rejects.toThrow("unavailable");
			const restored = await s.host("a");
			await until(() => restored.processes[0]?.state === "dormant");
			expect(restored.processes[0].shard).toBeNull();
			await expect(b.call("probe", 0, 9)).rejects.toThrow("unavailable");
		} finally {
			await Promise.all(hosts.map((h) => h.close()));
			await s.close();
		}
	}, 30000);
	test("login installs the identify hook and stops on exhausted re-identification allowance", async () => {
		const s = await stack({
			sessionStartLimit: {
				total: 1,
				remaining: 1,
				max_concurrency: 1,
				reset_after: 60000,
			},
		});
		try {
			await Bun.sleep(5500);
			const a = await s.host("a", {
				identifyTimeoutMs: 100,
				restart: false,
				env: { SHARD_TEST_MODE: "login" },
			});
			await until(() => a.processes[0]?.state === "running");
			await until(async () => await a.request(0, "loginState", null));
			expect(await a.request(0, "loginState", null)).toBe(true);
			await expect(a.request(0, "identify", null)).rejects.toThrow();
			await until(() => a.processes[0]?.state === "failed");
			expect(a.processes[0].pid).toBeNull();
		} finally {
			await s.close();
		}
	}, 15000);
});
