import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import {
	mkdtempSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { CoordinatorState } from "../../src/sharding/recovery/CoordinatorState";
import {
	HostOwnership,
	StateDirectory,
	isBusy,
} from "../../src/sharding/recovery/ownership";
import { fixture, logger, tokenA, until } from "./helpers";
import { ShardCoordinator } from "../../src/sharding/coordinator/Coordinator";
import { ShardManager } from "../../src/sharding/manager/Manager";

function folder() {
	const path = mkdtempSync(join(tmpdir(), "virello-state-test-"));
	return {
		path,
		remove() {
			if (!resolve(path).startsWith(resolve(tmpdir()) + sep))
				throw new Error("Unsafe test directory.");
			rmSync(path, { recursive: true, force: true });
		},
	};
}
const signal = () => new AbortController().signal;

test("interrupted first-time setup finishes before an ownership lock can be used", () => {
	const f = folder();
	try {
		writeFileSync(
			join(f.path, "virello-state.json"),
			JSON.stringify({
				version: 1,
				deployment: "test",
				role: "host:a",
				initialized: false,
			}),
		);
		const directory = new StateDirectory(
			{ deployment: "test", directory: f.path },
			"host:a",
		);
		const host = new HostOwnership(directory);
		host.close();
		expect(
			JSON.parse(readFileSync(join(f.path, "virello-state.json"), "utf8"))
				.initialized,
		).toBe(true);
	} finally {
		f.remove();
	}
});

test("shutdown cancels waiting for live coordinator and supervisor locks without admitting work", async () => {
	const f = folder();
	const state = { deployment: "test", directory: join(f.path, "coordinator") };
	const owned = new CoordinatorState(state, ["a"]);
	const hostState = { deployment: "test", directory: join(f.path, "host") };
	const hostLock = new HostOwnership(new StateDirectory(hostState, "host:a"));
	const coordinator = new ShardCoordinator({
		shardCount: 1,
		workers: [{ id: "a", token: tokenA, shards: [0] }],
		botToken: "offline-test-placeholder",
		state,
		logger,
		port: 0,
	});
	const host = new ShardManager({
		id: "a",
		token: tokenA,
		url: "ws://127.0.0.1:1/sharding",
		script: fixture,
		state: hostState,
		logger,
	});
	const waiting = [coordinator.start(), host.start()];
	for (const pending of waiting) void pending.catch(() => {});
	try {
		await Bun.sleep(30);
		expect(coordinator.url).toBeUndefined();
		expect(host.processes).toEqual([]);
		await Promise.all([coordinator.close(), host.close()]);
		for (const pending of waiting) await expect(pending).rejects.toThrow();
	} finally {
		await Promise.all([coordinator.close(), host.close()]);
		owned.close();
		hostLock.close();
		f.remove();
	}
});
test("a paused orphan holds ownership until OS exit; a late orphan cannot enter a new generation", async () => {
	const f = folder();
	const options = { deployment: "test", directory: f.path };
	const directory = new StateDirectory(options, "host:a");
	let host = new HostOwnership(directory);
	const children: Bun.Subprocess[] = [];
	try {
		await host.fence(signal(), () => {});
		const config = host.childConfig;
		const messages: { event: string; message?: string }[] = [];
		for (const mode of ["paused", "late"])
			children.push(
				Bun.spawn(
					[
						process.execPath,
						fileURLToPath(new URL("./fixtures/ownership.ts", import.meta.url)),
						JSON.stringify(config),
						mode,
					],
					{
						stdin: "ignore",
						stdout: "pipe",
						stderr: "pipe",
						windowsHide: true,
						ipc: (message) =>
							messages.push(message as (typeof messages)[number]),
					},
				),
			);
		await until(
			() =>
				messages.some((m) => m.event === "held") &&
				messages.some((m) => m.event === "waiting"),
		);
		host.close(); // Simulate a lost supervisor; the child's OS lock remains independent.
		host = new HostOwnership(directory);
		let fenced = false;
		let waiting = false;
		const pending = host
			.fence(signal(), () => {
				waiting = true;
			})
			.then(() => {
				fenced = true;
			});
		await until(() => waiting);
		expect(fenced).toBe(false);
		expect(children[0]!.exitCode).toBeNull();
		children[0]!.kill(9);
		await children[0]!.exited;
		await pending;
		expect(host.childConfig.epoch).not.toBe(config.epoch);
		children[1]!.send("acquire");
		await until(() => messages.some((m) => m.event === "rejected"));
		expect(messages.find((m) => m.event === "rejected")?.message).toContain(
			"revoked supervisor generation",
		);
	} finally {
		for (const child of children) {
			child.kill(9);
			await child.exited;
		}
		host.close();
		f.remove();
	}
}, 15000);

test("exclusive supervisor and coordinator locks cannot be replaced by a second owner", () => {
	const f = folder();
	const directory = new StateDirectory(
		{ deployment: "test", directory: join(f.path, "host") },
		"host:a",
	);
	const host = new HostOwnership(directory);
	const stateOptions = {
		deployment: "test",
		directory: join(f.path, "coordinator"),
	};
	const state = new CoordinatorState(stateOptions, ["a", "b"]);
	try {
		for (const create of [
			() => new HostOwnership(directory),
			() => new CoordinatorState(stateOptions, ["a", "b"]),
		]) {
			let error: unknown;
			try {
				create();
			} catch (cause) {
				error = cause;
			}
			expect(isBusy(error)).toBe(true);
		}
	} finally {
		state.close();
		host.close();
	}
	try {
		expect(() => new CoordinatorState(stateOptions, ["a"])).toThrow(
			"Fence removed hosts",
		);
	} finally {
		f.remove();
	}
});

test("corrupt runtime state and old snapshots are disposable only after every host is fenced", () => {
	const f = folder();
	const options = { deployment: "test", directory: f.path };
	let state = new CoordinatorState(options, ["a", "b"]);
	const path = join(f.path, "runtime.sqlite");
	try {
		writeFileSync(path, "corrupt runtime cache");
		state.owners.set("a", "instance-a");
		expect(() => state.rebuild({ leases: [] })).toThrow(
			"Every configured host",
		);
		expect(readFileSync(path, "utf8")).toBe("corrupt runtime cache");
		state.owners.set("b", "instance-b");
		state.rebuild({ leases: [[0, "old-generation"]] });
		const oldEpoch = state.epoch;
		const oldBytes = readFileSync(path);
		state.write({ leases: [] });
		state.close();
		writeFileSync(path, oldBytes); // An otherwise valid old backup is still untrusted.
		state = new CoordinatorState(options, ["a", "b"]);
		expect(state.status.waitingForHosts).toEqual(["a", "b"]);
		expect(state.epoch).not.toBe(oldEpoch);
		expect(() => state.rebuild({ leases: [] })).toThrow();
		state.owners.set("a", "next-a");
		state.owners.set("b", "next-b");
		state.rebuild({ leases: [] });
		const db = new Database(path);
		try {
			expect(
				db.query<{ snapshot: string }, []>("SELECT snapshot FROM runtime").get()
					?.snapshot,
			).toBe('{"leases":[]}');
			db.exec("UPDATE runtime SET revision=99");
		} finally {
			db.close();
		}
		expect(() => state.write({ leases: [] })).toThrow(
			"epoch or revision changed",
		);
	} finally {
		state.close();
		f.remove();
	}
});

test("corrupt interlocks, changed identities and unrelated files are never silently reset", () => {
	const f = folder();
	try {
		const directory = new StateDirectory(
			{ deployment: "test", directory: join(f.path, "owned") },
			"host:a",
		);
		const path = directory.file("supervisor.sqlite");
		writeFileSync(path, "broken interlock");
		expect(() => new HostOwnership(directory)).toThrow();
		expect(readFileSync(path, "utf8")).toBe("broken interlock");
		writeFileSync(path, "");
		expect(() => new HostOwnership(directory)).toThrow();
		expect(readFileSync(path)).toHaveLength(0);
		unlinkSync(path);
		expect(
			() =>
				new StateDirectory(
					{ deployment: "test", directory: directory.path },
					"host:a",
				),
		).toThrow("interlock is missing");
		expect(
			() =>
				new StateDirectory(
					{ deployment: "other", directory: directory.path },
					"host:a",
				),
		).toThrow();
		writeFileSync(join(f.path, "unrelated.txt"), "keep");
		expect(
			() =>
				new StateDirectory(
					{ deployment: "test", directory: f.path },
					"coordinator",
				),
		).toThrow("empty, dedicated");
		expect(readFileSync(join(f.path, "unrelated.txt"), "utf8")).toBe("keep");
	} finally {
		f.remove();
	}
});

test("a lost coordinator roster is not silently rebound to a smaller deployment", () => {
	const f = folder();
	const options = { deployment: "test", directory: f.path };
	const state = new CoordinatorState(options, ["a", "b"]);
	state.close();
	const db = new Database(join(f.path, "coordinator.sqlite"));
	db.exec("DELETE FROM ownership");
	db.close();
	try {
		expect(() => new CoordinatorState(options, ["a"])).toThrow(
			"Ownership configuration changed",
		);
	} finally {
		f.remove();
	}
});
