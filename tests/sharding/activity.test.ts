import { afterEach, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { ConsoleRecord } from "../../src/core/logging/format";
import type { LoggerLike } from "../../src/core/logging/LoggerLike";
import {
	encode,
	type Frame,
	frame,
	type Op,
} from "../../src/sharding/transport/protocol";
import { Socket } from "../../src/sharding/transport/socket";
import { stack, tokenA, tokenB, until } from "./helpers";

const stacks: Awaited<ReturnType<typeof stack>>[] = [];
afterEach(async () => {
	// Also clean up if a connection fails before a test enters its try/finally.
	for (const value of stacks.splice(0).reverse()) await value.close();
});
async function activityStack(...args: Parameters<typeof stack>) {
	const value = await stack(...args);
	stacks.push(value);
	return value;
}

function capture() {
	const calls: { level: keyof LoggerLike; value: unknown }[] = [];
	let closed = false;
	const logger = {
		...Object.fromEntries(
			(["debug", "notif", "alert", "error"] as const).map((level) => [
				level,
				(value: unknown) => calls.push({ level, value }),
			]),
		),
		async close() {
			closed = true;
		},
	} as LoggerLike & { close(): Promise<void> };
	return {
		logger,
		calls,
		event(name: string) {
			return calls.filter((call) =>
				String(call.value).includes(`[sharding.coordinator ${name}]`),
			);
		},
		get text() {
			return calls.map((call) => String(call.value)).join("\n");
		},
		get closed() {
			return closed;
		},
	};
}

async function peer(
	url: string,
	host = "a",
	instance: string = crypto.randomUUID(),
) {
	const socket = new Socket(url, {
		headers: {
			authorization: `Bearer ${host === "b" ? tokenB : tokenA}`,
			"x-virello-worker": host,
			"x-virello-instance": instance,
		},
		perMessageDeflate: false,
	});
	const messages: Frame[] = [];
	let closed = false;
	socket.addEventListener("message", (event) =>
		messages.push(JSON.parse(event.data)),
	);
	socket.addEventListener("close", () => {
		closed = true;
	});
	const next = async <K extends Op>(op: K, id?: string) => {
		await until(
			() =>
				messages.some(
					(message) => message.op === op && (!id || message.id === id),
				),
			5000,
		);
		return messages.splice(
			messages.findIndex(
				(message) => message.op === op && (!id || message.id === id),
			),
			1,
		)[0] as Frame<K>;
	};
	await next("welcome");
	return {
		socket,
		instance,
		next,
		get closed() {
			return closed;
		},
		send(
			op: Op,
			data: Record<string, unknown> = {},
			id: string = crypto.randomUUID(),
		) {
			if (op === "ready")
				socket.send(
					encode(
						frame("lease", undefined, {
							previous: data.shard,
							generation: data.generation,
							preferred: data.shard,
						}),
						65536,
					),
				);
			socket.send(encode(frame(op, id, data), 65536));
			return id;
		},
		async close() {
			if (!closed) socket.close(1000);
			await until(() => closed);
		},
	};
}

for (const level of ["info", "debug"] as const) {
	test(`actual coordinator example emits safe ${level} activity through real WebSockets`, async () => {
		const folder = mkdtempSync(join(tmpdir(), "virello-coordinator-activity-"));
		expect(resolve(folder).startsWith(resolve(tmpdir()) + sep)).toBe(true);
		const child = Bun.spawn(
			[
				process.execPath,
				"--preload",
				"./tests/sharding/fixtures/coordinatorMetadata.ts",
				"examples/coordinator.ts",
			],
			{
				cwd: `${import.meta.dir}/../..`,
				env: {
					...process.env,
					DISCORD_TOKEN: "fixture-discord-credential-do-not-use",
					SHARD_HOST_ID: "a",
					SHARD_HOST_TOKEN: tokenA,
					SHARD_WORKERS: "",
					SHARD_COUNT: "1",
					SHARD_COORDINATOR_HOST: "127.0.0.1",
					SHARD_COORDINATOR_PORT: "0",
					SHARD_TLS_CERT: "",
					SHARD_TLS_KEY: "",
					VIRELLO_LOG_FORMAT: "json",
					VIRELLO_LOG_LEVEL: level,
					VIRELLO_LOG_STACKS: "off",
					VIRELLO_TEST_CONTROL_SHUTDOWN: "1",
				},
				stdin: "ignore",
				stdout: "pipe",
				stderr: "pipe",
				windowsHide: true,
				serialization: "json",
				ipc: () => {},
			},
		);
		let stdout = "";
		let stderr = "";
		const read = async (
			stream: ReadableStream<Uint8Array>,
			append: (text: string) => void,
		) => {
			const decoder = new TextDecoder();
			for await (const chunk of stream)
				append(decoder.decode(chunk, { stream: true }));
		};
		const reading = Promise.all([
			read(child.stdout, (text) => {
				stdout += text;
			}),
			read(child.stderr, (text) => {
				stderr += text;
			}),
		]);
		const records = () =>
			stdout
				.split("\n")
				.slice(0, -1)
				.map((line) => JSON.parse(line) as ConsoleRecord);
		let host: Awaited<ReturnType<typeof peer>> | undefined;
		try {
			await until(
				() => records().some((record) => record.event === "listening"),
				10000,
			);
			const listening = records().find(
				(record) => record.event === "listening",
			)!;
			host = await peer(`ws://127.0.0.1:${listening.context!.port}/sharding`);
			host.send("ready", { shard: 0, generation: "fixture-generation" });
			const ping = host.send("ping");
			await host.next("pong", ping);
			const requestId = host.send("call", {
				source: -1,
				target: 0,
				name: "probe",
				payload: { private: "fixture-sensitive-payload" },
				timeoutMs: 1000,
			});
			const invocation = await host.next("invoke");
			host.send(
				"result",
				{
					shard: 0,
					generation: "fixture-generation",
					result: { ok: true, value: "fixture-sensitive-result" },
				},
				invocation.id,
			);
			expect((await host.next("reply", requestId)).data).toEqual({
				ok: true,
				value: "fixture-sensitive-result",
			});
			host.send("offline", { shard: 0, generation: "fixture-generation" });
			const release = host.send("release");
			await host.next("released", release);
			await host.close();
			host = undefined;
			child.send({ fixture: "shutdown" });
			await until(() => child.exitCode !== null, 10000);
			await reading;
			expect(await child.exited).toBe(0);
			expect(stderr).toBe("");
			const activity = records();
			const events = activity.map((record) => record.event);
			for (const event of [
				"host_connected",
				"shard_registered",
				"request_dispatched",
				"request_completed",
				"shard_offline",
				"host_drained",
				"host_disconnected",
				"stopping",
				"stopped",
			])
				expect(events).toContain(event);
			const sent = activity.find(
				(record) => record.event === "request_dispatched",
			)!;
			const completed = activity.find(
				(record) => record.event === "request_completed",
			)!;
			expect(sent.level).toBe("info");
			expect(sent.context).toMatchObject({
				requestId,
				routeId: invocation.id,
				host: "a",
				destinationHost: "a",
				shard: 0,
				operation: "probe",
			});
			expect(completed.context!.requestId).toBe(requestId);
			expect(completed.context!.routeId).toBe(invocation.id);
			expect(completed.context!.connectionId).toBe(sent.context!.connectionId);
			expect(completed.context!.durationMs).toBeGreaterThanOrEqual(0);
			expect(
				activity.filter((record) => record.event === "host_disconnected"),
			).toHaveLength(1);
			expect(events.includes("frame_received")).toBe(level === "debug");
			expect(events.includes("frame_sent")).toBe(level === "debug");
			for (const secret of [
				tokenA,
				"fixture-discord-credential-do-not-use",
				"fixture-sensitive-payload",
				"fixture-sensitive-result",
				"\x1b",
			])
				expect(stdout).not.toContain(secret);
			expect(
				stdout.split("\n").every((line) => Buffer.byteLength(line) <= 8192),
			).toBe(true);
		} finally {
			await host?.close();
			if (child.exitCode === null) child.kill(9);
			await child.exited;
			await reading;
			rmSync(folder, { recursive: true, force: true });
		}
	}, 20000);
}

test("authentication, upgrade and reconnect activity preserves rejection statuses and allows fresh reconnects", async () => {
	const logs = capture();
	const s = await activityStack({ logger: logs.logger });
	let host: Awaited<ReturnType<typeof peer>> | undefined;
	try {
		const url = s.coordinator.url!.replace("ws:", "http:");
		expect(
			(
				await fetch(url, {
					headers: {
						"x-virello-worker": "unknown-sensitive-worker",
						authorization: "Bearer unknown-sensitive-credential",
					},
				})
			).status,
		).toBe(401);
		expect(
			(
				await fetch(url, {
					headers: {
						"x-virello-worker": "a",
						authorization: "Bearer unknown-sensitive-credential",
					},
				})
			).status,
		).toBe(401);
		const headers = {
			"x-virello-worker": "a",
			authorization: `Bearer ${tokenA}`,
			"x-virello-instance": "fixture-instance",
		};
		expect((await fetch(url, { headers })).status).toBe(400);
		host = await peer(s.coordinator.url!, "a", "fixture-instance");
		expect(
			(await fetch(url, { headers: { ...headers, upgrade: "websocket" } }))
				.status,
		).toBe(409);
		await host.close();
		await until(() => !s.coordinator.workers[0].connected);
		expect(
			(
				await fetch(url, {
					headers: {
						...headers,
						upgrade: "websocket",
						"x-virello-instance": "different-instance",
					},
				})
			).status,
		).toBe(400);
		host = await peer(s.coordinator.url!, "a", "different-instance");
		expect(logs.event("host_connected")).toHaveLength(2);
		await host.close();
		host = undefined;
		await until(() => !s.coordinator.workers[0].connected);
		expect(logs.event("authentication_rejected")).toHaveLength(2);
		expect(logs.text).toContain("reason=invalid_credentials");
		expect(logs.text).toContain("reason=host_already_connected");
		expect(logs.text).not.toContain("ownership_reserved");
		for (const secret of [
			tokenA,
			tokenB,
			"unknown-sensitive-worker",
			"unknown-sensitive-credential",
		])
			expect(logs.text).not.toContain(secret);
	} finally {
		await host?.close();
		await s.close();
	}
	expect(logs.closed).toBe(false);
});

test("request outcomes retain correlation and report capacity, timeout, cancellation, failure and unavailable destinations", async () => {
	const logs = capture();
	const s = await activityStack({
		logger: logs.logger,
		limits: { maxPending: 1 },
	});
	const a = await peer(s.coordinator.url!);
	const b = await peer(s.coordinator.url!, "b");
	try {
		a.send("ready", { shard: 0, generation: "a1" });
		b.send("ready", { shard: 1, generation: "b1" });
		await until(() =>
			s.coordinator.workers.every((worker) => worker.shards.length === 1),
		);
		const call = {
			source: 0,
			target: 1,
			name: "probe",
			payload: null,
			timeoutMs: 200,
		};
		const timed = a.send("call", call);
		const timedInvoke = await b.next("invoke");
		const capacity = a.send("call", call);
		expect((await a.next("reply", capacity)).data).toMatchObject({
			ok: false,
			error: { code: "CAPACITY" },
		});
		expect((await a.next("reply", timed)).data).toMatchObject({
			ok: false,
			error: { code: "TIMEOUT" },
		});
		expect(String(logs.event("request_timed_out")[0].value)).toContain(
			`requestId=${timed}`,
		);
		expect(String(logs.event("request_timed_out")[0].value)).toContain(
			`routeId=${timedInvoke.id}`,
		);
		const cancelled = a.send("call", { ...call, timeoutMs: 1000 });
		await b.next("invoke");
		a.send("cancel", {}, cancelled);
		expect((await a.next("reply", cancelled)).data).toMatchObject({
			ok: false,
			error: { code: "ABORTED" },
		});
		const failed = a.send(
			"call",
			{ ...call, name: tokenA, timeoutMs: 1000 },
			tokenB,
		);
		const failedInvoke = await b.next("invoke");
		expect(failedInvoke.data.name).toBe(tokenA);
		b.send(
			"result",
			{
				shard: 1,
				generation: "b1",
				result: {
					ok: false,
					error: { code: "HANDLER", message: "private-provider-details" },
				},
			},
			failedInvoke.id,
		);
		expect((await a.next("reply", failed)).data).toMatchObject({
			ok: false,
			error: { message: "private-provider-details" },
		});
		const disconnected = a.send("call", { ...call, timeoutMs: 1000 });
		await b.next("invoke");
		await b.close();
		expect((await a.next("reply", disconnected)).data).toMatchObject({
			ok: false,
			error: { code: "DISCONNECTED" },
		});
		const unavailable = a.send("call", call);
		expect((await a.next("reply", unavailable)).data).toMatchObject({
			ok: false,
			error: { code: "UNAVAILABLE" },
		});
		expect(logs.event("request_cancelled")).toHaveLength(1);
		expect(logs.event("request_failed")).toHaveLength(2);
		expect(logs.event("request_rejected")).toHaveLength(2);
		expect(logs.text).toContain("code=HANDLER");
		for (const secret of [tokenA, tokenB, "private-provider-details"])
			expect(logs.text).not.toContain(secret);
		expect(s.coordinator.pendingCount).toBe(0);
	} finally {
		await Promise.all([a.close(), b.close()]);
		await s.close();
	}
});

test("identify activity distinguishes queueing, granting, completion, cancellation and exhausted allowance", async () => {
	const logs = capture();
	const s = await activityStack({
		logger: logs.logger,
		sessionStartLimit: {
			total: 1,
			remaining: 1,
			reset_after: 60000,
			max_concurrency: 1,
		},
	});
	const a = await peer(s.coordinator.url!);
	try {
		a.send("ready", { shard: 0, generation: "a1" });
		await Bun.sleep(5500);
		const first = a.send("identify", {
			shard: 0,
			generation: "a1",
			timeoutMs: 1000,
		});
		expect((await a.next("reply", first)).data.ok).toBe(true);
		a.send("done", { shard: 0, generation: "a1" });
		const cancelled = a.send("identify", {
			shard: 0,
			generation: "a1",
			timeoutMs: 1000,
		});
		a.send("cancel", {}, cancelled);
		expect((await a.next("reply", cancelled)).data).toMatchObject({
			ok: false,
			error: { code: "ABORTED" },
		});
		const exhausted = a.send("identify", {
			shard: 0,
			generation: "a1",
			timeoutMs: 50,
		});
		expect((await a.next("reply", exhausted)).data).toMatchObject({
			ok: false,
			error: { code: "IDENTIFY_TIMEOUT" },
		});
		s.coordinator.updateSessionLimit({
			total: 1,
			remaining: 1,
			reset_after: 60000,
			max_concurrency: 1,
		});
		expect(logs.event("identify_queued")).toHaveLength(3);
		expect(logs.event("identify_granted")).toHaveLength(1);
		expect(logs.event("identify_completed")).toHaveLength(1);
		expect(logs.event("identify_cancelled")).toHaveLength(1);
		expect(logs.event("identify_timed_out")).toHaveLength(1);
		expect(
			String(logs.event("identify_limits_updated").at(-1)!.value),
		).toContain("remaining=0");
		expect(logs.event("identify_limits_updated").at(-1)!.level).toBe("alert");
	} finally {
		await a.close();
		await s.close();
	}
}, 10000);

test("heartbeat and malformed-frame disconnects are logged once and clear disconnected sessions", async () => {
	const logs = capture();
	const s = await activityStack({ logger: logs.logger });
	const a = await peer(s.coordinator.url!);
	const b = await peer(s.coordinator.url!, "b");
	try {
		const session = [...s.coordinator["sessions"].values()].find(
			(session) => session.host.id === "a",
		)!;
		session.lastSeen = performance.now() - 20000;
		await until(() => a.closed);
		b.socket.send("malformed-sensitive-frame");
		await until(() => b.closed);
		expect(logs.event("host_disconnected")).toHaveLength(2);
		expect(logs.text).toContain("reason=heartbeat_timeout");
		expect(logs.text).toContain("reason=protocol_rejected");
		expect(s.coordinator.workers.every((worker) => !worker.connected)).toBe(
			true,
		);
		expect(logs.text).not.toContain("ownershipRetained");
		expect(logs.text).not.toContain("malformed-sensitive-frame");
	} finally {
		await Promise.all([a.close(), b.close()]);
		await s.close();
	}
});

test("a throwing custom activity sink cannot change WebSocket registration, replies or shutdown", async () => {
	const fallback = spyOn(process.stderr, "write").mockImplementation(
		() => true,
	);
	const fail = () => {
		throw new Error("private-sink-details");
	};
	const s = await activityStack({
		logger: { debug: fail, notif: fail, alert: fail, error: fail },
	});
	const a = await peer(s.coordinator.url!);
	try {
		a.send("ready", { shard: 0, generation: "a1" });
		const request = a.send("call", {
			source: -1,
			target: 0,
			name: "probe",
			payload: null,
			timeoutMs: 1000,
		});
		const invocation = await a.next("invoke");
		a.send(
			"result",
			{ shard: 0, generation: "a1", result: { ok: true, value: 7 } },
			invocation.id,
		);
		expect((await a.next("reply", request)).data).toEqual({
			ok: true,
			value: 7,
		});
		await a.close();
	} finally {
		await a.close();
		await s.close();
	}
	expect(fallback).toHaveBeenCalled();
	expect(
		fallback.mock.calls.map((args) => String(args[0])).join(""),
	).not.toContain("private-sink-details");
});
