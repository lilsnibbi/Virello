import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import "./fixtures/contracts";
import { ShardCoordinator } from "../../packages/sharding/src/coordinator/Coordinator";
import { ShardManager } from "../../packages/sharding/src/manager/Manager";

import { fixture, logger, sessionLimit, tokenA, until } from "./helpers";

function legacyFiles() {
	const folder = mkdtempSync(join(tmpdir(), "virello-unused-state-"));
	const statePath = join(folder, "sharding.sqlite");
	const stateDirectory = join(folder, ".virello-sharding", "a");
	mkdirSync(stateDirectory, { recursive: true });
	const hostFile = join(stateDirectory, "host.sqlite");
	const gate = join(stateDirectory, "supervisor.json");
	writeFileSync(hostFile, "Invalid old host state must be ignored.");
	writeFileSync(gate, '{"epoch":"obsolete"}');
	const held = new Database(statePath);
	held.exec(
		"CREATE TABLE virello_sharding (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
	);
	held
		.query("INSERT INTO virello_sharding VALUES (?, ?)")
		.run("owner:a", '"old-supervisor"');
	held.exec("PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; COMMIT;");
	const originals = [statePath, hostFile, gate].map((path) => ({
		path,
		bytes: readFileSync(path),
	}));
	const options = {
		development: true,
		shardCount: 1,
		workers: [{ id: "a", token: tokenA, shards: [0] }],
		statePath,
		port: 0,
		sessionStartLimit: sessionLimit,
		logger,
	};
	return {
		folder,
		statePath,
		stateDirectory,
		options,
		unchanged() {
			for (const original of originals)
				expect(readFileSync(original.path).equals(original.bytes)).toBe(true);
			expect(
				held
					.query("SELECT value FROM virello_sharding WHERE key = ?")
					.get("owner:a"),
			).toEqual({ value: '"old-supervisor"' });
		},
		remove() {
			held.close();
			if (!resolve(folder).startsWith(resolve(tmpdir()) + sep))
				throw new Error("Unsafe fixture path.");
			rmSync(folder, { recursive: true, force: true });
		},
	};
}
function manager(url: string, stateDirectory?: string) {
	// Old JavaScript config keys are harmless even though they are no longer part of the public types.
	const options = {
		id: "a",
		url,
		token: tokenA,
		script: fixture,
		logger,
		stateDirectory,
		startupTimeoutMs: 8000,
		shutdownTimeoutMs: 300,
		identifyTimeoutMs: 1000,
		assignmentPollIntervalMs: 50,
		reconnect: { initialDelayMs: 50, maxDelayMs: 100 },
		restart: false as const,
	};
	return new ShardManager(options);
}

test("production restart requires explicit fleet fencing and leaves unrelated legacy files untouched", async () => {
	const f = legacyFiles();
	let coordinator = new ShardCoordinator(f.options);
	let host: ShardManager | undefined;
	try {
		await coordinator.start();
		const port = Number(new URL(coordinator.url!).port);
		host = manager(coordinator.url!, f.stateDirectory);
		await host.start();
		await until(() => host!.processes[0]?.state === "running");
		const child = host["children"].get(0)!;
		const term = coordinator.status.coordinatorTerm;
		await coordinator.close();
		await until(() => !host!.isConnected);
		coordinator = new ShardCoordinator({
			...f.options,
			development: false,
			applicationId: "test-app",
			port,
		});
		await coordinator.start();
		await until(() => host!.isConnected);
		await Bun.sleep(150);
		expect(coordinator.status.recoveryRequired).toBe(true);
		expect(coordinator.status.coordinatorTerm).not.toBe(term);
		expect(coordinator.status.leasedShards).toEqual([]);
		expect(child.process.exitCode).toBeNull();
		expect(host.processes[0].pid).toBe(child.process.pid);
		await expect(
			coordinator.confirmFleetStopped(
				{
					operationId: "bad",
					hosts: [],
					evidence: "not every host is accounted for",
				},
				sessionLimit,
			),
		).rejects.toMatchObject({ code: "EVIDENCE" });
		await host.close();
		expect(child.process.exitCode).not.toBeNull();
		await coordinator.confirmFleetStopped(
			{
				operationId: "fenced",
				hosts: ["a"],
				evidence:
					"test-owned host tree exited; fixture has no external effects",
			},
			sessionLimit,
		);
		expect(coordinator.status.recoveryRequired).toBe(false);
		host = manager(coordinator.url!, f.stateDirectory);
		await host.start();
		await until(() => host!.processes[0]?.state === "running");
		expect((await host.request(0, "probe", { value: 1 })).value).toBe(1);
		f.unchanged();
	} finally {
		await host?.close();
		await coordinator.close();
		f.remove();
	}
}, 25000);

test("a new supervisor stays dormant until a confirmed exit releases capacity", async () => {
	const f = legacyFiles();
	const coordinator = new ShardCoordinator(f.options);
	let original: ShardManager | undefined;
	let replacement: ShardManager | undefined;
	try {
		await coordinator.start();
		original = manager(coordinator.url!, f.stateDirectory);
		await original.start();
		await until(() => original!.processes[0]?.state === "running");
		replacement = manager(coordinator.url!, f.stateDirectory);
		const starting = replacement.start();
		void starting.catch(() => {});
		await Bun.sleep(350);
		await starting;
		await until(() => replacement!.processes[0]?.state === "dormant");
		expect(replacement.isConnected).toBe(true);
		expect(replacement.processes[0].shard).toBeNull();
		expect(original.isConnected).toBe(true);
		await original.close();
		await starting;
		await until(() => replacement!.processes[0]?.state === "running");
		expect(original.processes[0].pid).toBeNull();
		f.unchanged();
	} finally {
		await replacement?.close();
		await original?.close();
		await coordinator.close();
		f.remove();
	}
}, 15000);

test("a host started before its coordinator connects without spawning early; admission probes do not reserve it", async () => {
	const f = legacyFiles();
	const listener = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: () => new Response(),
	});
	const port = listener.port!;
	await listener.stop(true);
	const host = manager(`ws://127.0.0.1:${port}/sharding`, f.stateDirectory);
	const coordinator = new ShardCoordinator({ ...f.options, port });
	const starting = host.start();
	void starting.catch(() => {});
	try {
		await Bun.sleep(250);
		expect(host.processes).toHaveLength(0);
		await coordinator.start();
		const url = coordinator.url!.replace("ws:", "http:");
		expect((await fetch(url, { method: "HEAD" })).status).toBe(401);
		await starting;
		await until(() => host.processes[0]?.state === "running");
		await host.close();
		await until(() => !coordinator.workers[0].connected);
		const response = await fetch(url, {
			method: "HEAD",
			headers: {
				authorization: `Bearer ${tokenA}`,
				"x-virello-worker": "a",
				"x-virello-instance": "fresh",
			},
		});
		expect(response.status).toBe(204);
		expect(coordinator.workers[0].connected).toBe(false);
		f.unchanged();
	} finally {
		await host.close();
		await coordinator.close();
		f.remove();
	}
}, 15000);

async function coordinatorProcess(
	port: number,
	path: string,
	remaining: number,
) {
	const messages: { event: string; url?: string; elapsed?: number }[] = [];
	const child = Bun.spawn(
		[
			process.execPath,
			fileURLToPath(
				new URL("./fixtures/restartCoordinator.ts", import.meta.url),
			),
			String(port),
			path,
			String(remaining),
		],
		{
			stdout: "ignore",
			stderr: "inherit",
			windowsHide: true,
			serialization: "json",
			ipc(input) {
				messages.push(input as (typeof messages)[number]);
			},
		},
	);
	try {
		await until(
			() => messages.some((message) => message.event === "ready"),
			12000,
		);
		return {
			child,
			url: messages.find((message) => message.event === "ready")!.url!,
			messages,
		};
	} catch (error) {
		child.kill(9);
		await child.exited;
		throw error;
	}
}

test("an interrupted coordinator restarts on the same port, ignores old files and fetches fresh limits after cooldown", async () => {
	const f = legacyFiles();
	const processes: Awaited<ReturnType<typeof coordinatorProcess>>[] = [];
	let host: ShardManager | undefined;
	try {
		const first = await coordinatorProcess(0, f.statePath, 1);
		processes.push(first);
		host = manager(first.url, f.stateDirectory);
		await host.start();
		await until(() => host!.processes[0]?.state === "running");
		expect((await host.request(0, "identify", null)).hooked).toBe(true);
		const oldChild = host["children"].get(0)!;
		first.child.kill(9);
		await first.child.exited;
		const second = await coordinatorProcess(
			Number(new URL(first.url).port),
			f.statePath,
			0,
		);
		processes.push(second);
		await until(
			() => host!.isConnected && host!.processes[0]?.state === "dormant",
		);
		expect(oldChild.process.exitCode).toBeNull();
		expect(host.processes[0].pid).toBe(oldChild.process.pid);
		// Restart is not permission to reuse the previous process's session allowance.
		await expect(
			host.request(0, "identify", null, { timeoutMs: 1500 }),
		).rejects.toThrow();
		expect(host.processes[0].pid).toBe(oldChild.process.pid);
		expect(oldChild.process.exitCode).toBeNull();
		expect(host.processes[0].state).toBe("dormant");
		for (const run of processes) {
			expect(
				run.messages.filter((message) => message.event === "metadata"),
			).toHaveLength(1);
			expect(
				run.messages.find((message) => message.event === "metadata")!.elapsed,
			).toBeGreaterThanOrEqual(5400);
		}
		f.unchanged();
	} finally {
		await host?.close();
		for (const run of processes) {
			if (run.child.exitCode === null) run.child.kill(9);
			await run.child.exited;
		}
		f.remove();
	}
}, 40000);

test("another coordinator cannot listen on the active endpoint and shutdown cancels startup cooldown", async () => {
	const f = legacyFiles();
	const first = new ShardCoordinator(f.options);
	let duplicate: ShardCoordinator | undefined;
	let duplicateProcess: Bun.Subprocess<"ignore", "ignore", "pipe"> | undefined;
	const waiting = new ShardCoordinator({
		...f.options,
		sessionStartLimit: undefined,
		botToken: "offline-never-fetched",
	});
	try {
		await first.start();
		duplicate = new ShardCoordinator({
			...f.options,
			port: Number(new URL(first.url!).port),
		});
		await expect(duplicate.start()).rejects.toThrow();
		expect(first.url).toBeDefined();
		duplicateProcess = Bun.spawn(
			[
				process.execPath,
				fileURLToPath(
					new URL("./fixtures/restartCoordinator.ts", import.meta.url),
				),
				new URL(first.url!).port,
				f.statePath,
				"10",
				"manual",
			],
			{ stdin: "ignore", stdout: "ignore", stderr: "pipe", windowsHide: true },
		);
		await until(() => duplicateProcess!.exitCode !== null, 5000);
		expect(duplicateProcess.exitCode).not.toBe(0);
		expect(await new Response(duplicateProcess.stderr).text()).toContain(
			"EADDRINUSE",
		);
		const starting = waiting.start();
		const rejected = starting.catch((error: unknown) => error);
		await waiting.close();
		expect(await rejected).toBeInstanceOf(Error);
		expect(waiting.url).toBeUndefined();
		f.unchanged();
	} finally {
		if (duplicateProcess?.exitCode === null) duplicateProcess.kill(9);
		await duplicateProcess?.exited;
		await waiting.close();
		await duplicate?.close();
		await first.close();
		f.remove();
	}
});
