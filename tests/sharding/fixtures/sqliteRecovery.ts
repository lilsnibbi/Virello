// All metadata is synthetic. This fixture must never contact Discord.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { ShardCoordinator } from "../../../src/sharding/coordinator/Coordinator";
import { ShardManager } from "../../../src/sharding/manager/Manager";
import {
	fixture,
	logger,
	sessionLimit,
	tokenA,
	tokenB,
	until,
} from "../helpers";
import "./contracts";

const folder = Bun.argv[2]!;
let reads = 0;
let previousChildren: Bun.Subprocess[] = [];
globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0]) => {
	assert.equal(String(input), "https://discord.com/api/v10/gateway/bot");
	for (const child of previousChildren)
		assert.notEqual(
			child.exitCode,
			null,
			"metadata must follow confirmed child exit",
		);
	reads++;
	return Response.json({ shards: 2, session_start_limit: sessionLimit });
}, globalThis.fetch);
const options = {
	shardCount: 2,
	workers: [
		{ id: "a", token: tokenA, shards: [0] },
		{ id: "b", token: tokenB, shards: [1] },
	],
	port: 0,
	botToken: "offline-test-placeholder",
	state: { deployment: "offline", directory: join(folder, "coordinator") },
	logger,
};
let coordinator = new ShardCoordinator(options);
const hosts: ShardManager[] = [];
const runtime = join(options.state.directory, "runtime.sqlite");
try {
	await coordinator.start();
	const port = Number(new URL(coordinator.url!).port);
	for (const id of ["a", "b"])
		hosts.push(
			new ShardManager({
				id,
				url: coordinator.url!,
				token: id === "a" ? tokenA : tokenB,
				script: fixture,
				logger,
				state: { deployment: "offline", directory: join(folder, id) },
				startupTimeoutMs: 8000,
				shutdownTimeoutMs: 500,
				reconnect: { initialDelayMs: 50, maxDelayMs: 200 },
			}),
		);
	const first = hosts[0]!.start();
	await until(() => coordinator.status.recovery?.waitingForHosts.length === 1);
	assert.deepEqual(coordinator.status.recovery?.waitingForHosts, ["b"]);
	assert.equal(reads, 0);
	assert.equal(hosts[0]!.processes.length, 0);
	assert.deepEqual(coordinator.status.leasedShards, []);
	writeFileSync(runtime, "corrupt disposable runtime file");
	await Promise.all([first, hosts[1]!.start()]);
	await until(() =>
		hosts.every((host) => host.processes[0]?.state === "running"),
	);
	assert.equal(reads, 1);
	assert.equal(coordinator.status.recovery?.phase, "active");
	const backup = readFileSync(runtime);
	const oldEpoch = coordinator.status.recovery!.epoch;
	const initialPids = hosts.map((host) => host.processes[0]!.pid);
	// A transport-only outage in the same epoch reconciles surviving children without a reconnect storm.
	hosts[0]!["socket"]!.terminate();
	await until(() => !hosts[0]!.isConnected);
	await until(
		() => hosts[0]!.processes[0]?.state === "running" && hosts[0]!.isConnected,
	);
	assert.deepEqual(
		hosts.map((host) => host.processes[0]!.pid),
		initialPids,
	);
	assert.equal(reads, 1);
	for (const saved of [Buffer.from("corrupt cache after restart"), backup]) {
		previousChildren = hosts.map((host) => host["children"].get(0)!.process);
		await coordinator.close();
		await until(() => hosts.every((host) => !host.isConnected));
		writeFileSync(runtime, saved);
		coordinator = new ShardCoordinator({ ...options, port });
		await coordinator.start();
		assert.notEqual(coordinator.status.recovery!.epoch, oldEpoch);
		await until(() => coordinator.status.recovery?.phase === "active", 20000);
		await until(() =>
			hosts.every((host) => host.processes[0]?.state === "running"),
		);
		for (const [index, host] of hosts.entries()) {
			assert.notEqual(host.processes[0]!.pid, previousChildren[index]!.pid);
			assert.equal((await host.request(index, "probe", { value: 5 })).value, 5);
		}
	}
	// A stale write during a running incarnation stops admission and automatically reconstructs again.
	await hosts[0]!.request(0, "identify", null);
	previousChildren = hosts.map((host) => host["children"].get(0)!.process);
	const epoch = coordinator.status.recovery!.epoch;
	const db = new Database(runtime);
	const charged = db
		.query<{ snapshot: string }, []>("SELECT snapshot FROM runtime")
		.get()!;
	assert.equal(
		JSON.parse(charged.snapshot).remaining,
		99,
		"permit must be committed before delivery",
	);
	db.exec("UPDATE runtime SET epoch='old-backup'");
	db.close();
	await until(() => coordinator.status.recovery!.epoch !== epoch, 10000);
	await until(() => coordinator.status.recovery?.phase === "active", 20000);
	await until(() =>
		hosts.every((host) => host.processes[0]?.state === "running"),
	);
	assert.equal(reads, 4);
	const recovered = new Database(runtime, { readonly: true });
	const budget = recovered
		.query<{ snapshot: string }, []>("SELECT snapshot FROM runtime")
		.get()!;
	assert.equal(
		JSON.parse(budget.snapshot).remaining,
		99,
		"reconstruction must not refill an unexpired allowance",
	);
	recovered.close();
	process.send?.({ event: "passed", metadataReads: reads, restartCycles: 3 });
} finally {
	await Promise.all(hosts.map((host) => host.close()));
	await coordinator.close();
	process.disconnect?.();
}
