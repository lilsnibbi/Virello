import { expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import "./fixtures/contracts";
import { record } from "../../packages/util/src/runtime";
import { ShardCoordinator } from "../../packages/sharding/src/coordinator/Coordinator";

import { ready } from "../engine/fixtures";
import { sessionLimit, stack, tokenA, until } from "./helpers";

function gateway() {
	const sockets = new Set<ServerWebSocket<{ shard: number | null }>>();
	const identifies: number[] = [];
	const closes: { shard: number | null; code: number }[] = [];
	let connections = 0;
	let resumes = 0;
	const server = Bun.serve<{ shard: number | null }>({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request, server) {
			if (
				new URL(request.url).pathname === "/gateway" &&
				server.upgrade(request, { data: { shard: null } })
			)
				return;
			if (new URL(request.url).pathname === "/api/v10/gateway/bot")
				return Response.json({
					url: `ws://127.0.0.1:${server.port}/gateway`,
					shards: 2,
					session_start_limit: sessionLimit,
				});
			return new Response(null, { status: 404 });
		},
		websocket: {
			open(socket) {
				connections++;
				sockets.add(socket);
				socket.send(
					JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }),
				);
			},
			message(socket, raw) {
				const packet: unknown = JSON.parse(String(raw));
				if (!record(packet)) throw new Error("Invalid fixture packet.");
				if (packet.op === 1) socket.send(JSON.stringify({ op: 11, d: null }));
				if (packet.op === 6) resumes++;
				if (packet.op !== 2) return;
				if (
					!record(packet.d) ||
					!Array.isArray(packet.d.shard) ||
					typeof packet.d.shard[0] !== "number"
				)
					throw new Error("Missing managed shard tuple.");
				socket.data.shard = packet.d.shard[0];
				identifies.push(socket.data.shard);
				socket.send(
					JSON.stringify({
						op: 0,
						t: "READY",
						s: 1,
						d: ready(`ws://127.0.0.1:${server.port}/gateway`),
					}),
				);
			},
			close(socket, code) {
				sockets.delete(socket);
				closes.push({ shard: socket.data.shard, code });
			},
		},
	});
	return {
		baseURL: `http://127.0.0.1:${server.port}/api/v10`,
		sockets,
		identifies,
		closes,
		get connections() {
			return connections;
		},
		get resumes() {
			return resumes;
		},
		stop: () => server.stop(true),
	};
}

test("native workers keep sticky sessions, idle and release individually, and block terminal Gateway errors without process death", async () => {
	const discord = gateway();
	const s = await stack({
		botToken: "offline-test-placeholder",
		rest: { baseURL: discord.baseURL },
		workers: [{ id: "a", token: tokenA, shards: [0, 1] }],
	});
	let replacement: ShardCoordinator | undefined;
	try {
		const manager = await s.host("a", {
			script: new URL("./fixtures/gateway.ts", import.meta.url),
			env: { SHARD_TEST_API: discord.baseURL },
			assignmentPollIntervalMs: 50,
			maxDisconnectedLifetimeMs: 50,
			shutdownTimeoutMs: 3000,
		});
		await until(
			() => manager.status.processes.every((p) => p.gatewayReady),
			15000,
		);
		const pids = manager.processes.map((p) => p.pid);
		const peer = [...discord.sockets].find(
			(socket) => socket.data.shard === 1,
		)!;
		const identified = discord.identifies.length;
		// Repeated connection changes keep the exact committed owners and Gateway sessions.
		for (let cycle = 0; cycle < 2; cycle++) {
			const session = [...s.coordinator["sessions"].values()][0];
			s.coordinator["disconnect"](session, "peer_closed");
			session.socket?.terminate();
			await until(() => !manager.isConnected);
			await until(
				() =>
					manager.isConnected &&
					manager.processes.every((p) => p.state === "running"),
			);
			expect(discord.sockets.size).toBe(2);
			expect(discord.identifies.length).toBe(identified);
		}
		for (let cycle = 0; cycle < 2; cycle++) {
			await manager.setProcessIdle(0, true);
			await until(() => discord.sockets.size === 1);
			expect(discord.closes.at(-1)).toEqual({ shard: 0, code: 1000 });
			expect(discord.sockets.has(peer)).toBe(true);
			const connections = discord.connections;
			await manager.setProcessIdle(0, true);
			await Bun.sleep(100);
			expect(discord.connections).toBe(connections);
			await manager.setProcessIdle(0, false);
			await until(() => manager.status.processes[0].gatewayReady, 12000);
		}
		const assignment = manager.status.processes[0].assignment!;
		await manager.releaseProcess(0, 3000);
		expect(manager.processes[0]).toMatchObject({
			pid: pids[0],
			shard: null,
			state: "idle",
		});
		expect(s.coordinator.status.leasedShards).toEqual([1]);
		await manager.setProcessIdle(0, false);
		await until(() => manager.status.processes[0].gatewayReady, 12000);
		expect(manager.status.processes[0].assignment!.assignmentEpoch).not.toBe(
			assignment.assignmentEpoch,
		);
		const terminal = [...discord.sockets].find(
			(socket) => socket.data.shard === 0,
		)!;
		terminal.close(4014, "fixture disallowed intents");
		await until(
			() => manager.status.processes[0].blockedCode === "GATEWAY_4014",
		);
		const connections = discord.connections;
		await Bun.sleep(300);
		expect(discord.connections).toBe(connections);
		expect(manager.processes.map((p) => p.pid)).toEqual(pids);
		expect(discord.sockets.has(peer)).toBe(true);
		const port = Number(new URL(s.coordinator.url!).port);
		await s.coordinator.close();
		await until(() => !manager.isConnected);
		await Bun.sleep(300);
		expect(discord.sockets.has(peer)).toBe(true);
		expect(manager.status.processes[1].gatewayReady).toBe(true);
		replacement = new ShardCoordinator({
			...s.base,
			port,
			development: false,
			applicationId: "fixture-app",
			sessionStartLimit: undefined,
		});
		await replacement.start();
		await until(() => manager.isConnected);
		await Bun.sleep(300);
		expect(replacement.status.recoveryRequired).toBe(true);
		expect(replacement.status.leasedShards).toEqual([]);
		expect(discord.connections).toBe(connections);
		expect(manager.processes.map((p) => p.pid)).toEqual(pids);
	} finally {
		await s.close();
		await replacement?.close();
		await discord.stop();
	}
}, 60000);
