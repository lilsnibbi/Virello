import { afterEach, describe, expect, test } from "bun:test";
import {
	GatewayDispatchEvents as E,
	GatewayOpcodes as Op,
} from "discord-api-types/v10";
import {
	type $GatewayOptions,
	GatewayShard,
} from "../../src/engine/gateway/GatewayShard";
import { IdentifyGate } from "../../src/engine/gateway/IdentifyGate";
import { decodeFrame, gatewayURL } from "../../src/engine/gateway/protocol";
import type { $GatewayDispatch } from "../../src/engine/gateway/types";
import { dispatch, ready } from "./fixtures";
import { FakeClock, FakeSocket, flush } from "./support";

const active: GatewayShard[] = [];
afterEach(() => {
	for (const shard of active.splice(0)) shard.stop();
});

function harness(options: Partial<$GatewayOptions> = {}) {
	const clock = new FakeClock();
	const sockets: FakeSocket[] = [];
	const urls: string[] = [];
	const events: $GatewayDispatch[] = [];
	const failures: { error: Error; fatal: boolean }[] = [];
	let resets = 0;
	let identifies = 0;
	const shard = new GatewayShard(
		{
			token: "literal-fake-token",
			url: "wss://gateway.example.test/?compress=zlib-stream",
			intents: 1,
			clock,
			identify: async () => {
				identifies++;
			},
			socket: (url) => {
				urls.push(url);
				const socket = new FakeSocket();
				sockets.push(socket);
				return socket;
			},
			...options,
		},
		{
			dispatch: (packet) => {
				events.push(packet);
			},
			reset: () => {
				resets++;
			},
			failure: (error, fatal) => {
				failures.push({ error, fatal });
			},
		},
	);
	active.push(shard);
	const started = shard.start();
	void started.catch(() => {});
	return {
		clock,
		sockets,
		urls,
		events,
		failures,
		shard,
		started,
		get resets() {
			return resets;
		},
		get identifies() {
			return identifies;
		},
	};
}
function hello(socket: FakeSocket, interval = 10_000): void {
	socket.receive({ op: Op.Hello, d: { heartbeat_interval: interval } });
}
async function connected(options: Partial<$GatewayOptions> = {}) {
	const h = harness(options);
	hello(h.sockets[0]);
	await flush();
	h.sockets[0].receive(dispatch(E.Ready, ready(), 4));
	await h.started;
	return h;
}

describe("GatewayShard", () => {
	test("dispatch before a pending Identify completes reconnects without delivering or consuming a late permit", async () => {
		const permit = Promise.withResolvers<void>();
		const h = harness({ identify: () => permit.promise });
		hello(h.sockets[0]);
		h.sockets[0].receive(dispatch(E.Ready, ready(), 4));
		expect(h.events).toEqual([]);
		expect(h.shard.state).toBe("reconnecting");
		expect(h.failures[0]?.error.message).toContain("before Identify or Resume");
		permit.resolve();
		await flush();
		expect(h.sockets[0].sent).toEqual([]);
		expect(h.resets).toBe(0);
	});

	test("a fresh session rejects entity dispatches before READY", async () => {
		const h = harness();
		hello(h.sockets[0]);
		await flush();
		h.sockets[0].receive({ op: Op.Dispatch, t: "CUSTOM_EVENT", d: {}, s: 1 });
		expect(h.events).toEqual([]);
		expect(h.shard.state).toBe("reconnecting");
		expect(h.failures[0]?.error.message).toContain("before READY");
	});
	test("HELLO identifies once and READY resolves startup with normalized URLs", async () => {
		const h = harness({ shard: [1, 2] });
		expect(h.sockets[0].sent).toEqual([]);
		hello(h.sockets[0]);
		await flush();
		expect(h.identifies).toBe(1);
		expect(h.resets).toBe(1);
		expect(h.sockets[0].sent[0]).toMatchObject({
			op: Op.Identify,
			d: {
				token: "literal-fake-token",
				intents: 1,
				shard: [1, 2],
				properties: { browser: "virello-engine", device: "virello-engine" },
			},
		});
		expect(h.urls[0]).toBe("wss://gateway.example.test/?v=10&encoding=json");
		h.sockets[0].receive(dispatch(E.Ready, ready(), 4));
		await h.started;
		expect(h.shard.state).toBe("ready");
	});

	test("opcode 7 reconnects immediately using READY session and latest committed sequence", async () => {
		const h = await connected();
		h.sockets[0].receive({ op: 0, t: "CUSTOM_EVENT", d: {}, s: 8 });
		h.sockets[0].receive({ op: Op.Reconnect, d: null });
		await h.clock.advance(0);
		expect(h.urls[1]).toBe("wss://resume.example.test/?v=10&encoding=json");
		hello(h.sockets[1]);
		expect(h.sockets[1].sent[0]).toEqual({
			op: Op.Resume,
			d: { token: "literal-fake-token", session_id: "test-session", seq: 8 },
		});
		h.sockets[1].receive({ op: 0, t: E.Resumed, d: {}, s: 9 });
		expect(h.shard.state).toBe("ready");
		expect(h.identifies).toBe(1);
	});

	test("requested heartbeat uses sequence, ACK clears debt, and zombie closes socket", async () => {
		const h = await connected();
		h.sockets[0].receive({ op: Op.Heartbeat, d: null });
		expect(h.sockets[0].sent.at(-1)).toEqual({ op: Op.Heartbeat, d: 4 });
		h.sockets[0].receive({ op: Op.HeartbeatAck, d: null });
		await h.clock.advance(5000);
		expect(h.shard.state).toBe("ready");
		await h.clock.advance(10_000);
		expect(h.sockets[0].closed).toBe(4000);
		expect(h.failures.at(-1)?.error.message).toContain("not acknowledged");
	});

	for (const resumable of [true, false]) {
		test(`invalid session ${resumable} waits jitter and chooses resume or identify`, async () => {
			const h = await connected();
			h.clock.jitter = 0.25;
			h.sockets[0].receive({ op: Op.InvalidSession, d: resumable });
			await h.clock.advance(1999);
			expect(h.sockets).toHaveLength(1);
			await h.clock.advance(1);
			hello(h.sockets[1]);
			await flush();
			expect(h.sockets[1].sent[0].op).toBe(resumable ? Op.Resume : Op.Identify);
			expect(h.urls[1]).toContain(
				resumable ? "resume.example.test" : "gateway.example.test",
			);
		});
	}

	for (const code of [4004, 4010, 4011, 4012, 4013, 4014]) {
		test(`fatal close ${code} rejects startup and cancels timers`, async () => {
			const h = harness();
			h.sockets[0].disconnect(code);
			await expect(h.started).rejects.toThrow(`fatal code ${code}`);
			expect(h.shard.state).toBe("closed");
			expect(h.clock.pending).toBe(0);
			expect(h.failures.at(-1)?.fatal).toBe(true);
		});
	}
	for (const code of [1000, 1001, 4003, 4007, 4009]) {
		test(`close ${code} drops session before identifying again`, async () => {
			const h = await connected();
			h.sockets[0].disconnect(code);
			await h.clock.advance(500);
			hello(h.sockets[1]);
			await flush();
			expect(h.sockets[1].sent[0].op).toBe(Op.Identify);
		});
	}

	test("detached socket callbacks cannot mutate a newer connection", async () => {
		const h = await connected();
		const stale = h.sockets[0].onmessage;
		const staleClose = h.sockets[0].onclose;
		h.sockets[0].receive({ op: Op.Reconnect, d: null });
		await h.clock.advance(0);
		stale?.call(
			h.sockets[0] as unknown as WebSocket,
			new MessageEvent("message", {
				data: JSON.stringify({ op: 0, t: "STALE_EVENT", d: {}, s: 999 }),
			}),
		);
		staleClose?.call(
			h.sockets[0] as unknown as WebSocket,
			new CloseEvent("close", { code: 4004 }),
		);
		expect(h.events).toHaveLength(1);
		expect(h.shard.state).toBe("connecting");
	});

	test("HELLO and READY handshake deadlines reconnect and exhaust retry budget", async () => {
		const h = harness({ handshakeTimeoutMs: 100, maxReconnectAttempts: 1 });
		await h.clock.advance(100);
		expect(h.shard.state).toBe("reconnecting");
		await h.clock.advance(500);
		hello(h.sockets[1]);
		await flush();
		await h.clock.advance(100);
		await expect(h.started).rejects.toThrow("handshake timed out");
		expect(h.failures.map((failure) => failure.fatal)).toEqual([false, true]);
		expect(h.clock.pending).toBe(0);
	});

	test("stop aborts pending identify and suppresses its late resolution", async () => {
		let release: (() => void) | undefined;
		let signal: AbortSignal | undefined;
		const h = harness({
			identify: (value) => {
				signal = value;
				return new Promise<void>((resolve) => {
					release = resolve;
				});
			},
		});
		hello(h.sockets[0]);
		h.shard.stop();
		release?.();
		await flush();
		await expect(h.started).rejects.toThrow("Gateway closed");
		expect(signal?.aborted).toBe(true);
		expect(h.sockets[0].sent).toEqual([]);
		expect(h.clock.pending).toBe(0);
		expect(h.sockets[0].onmessage).toBeNull();
		await expect(h.shard.start()).rejects.toThrow("closed");
	});

	test("stop cancels scheduled reconnect", async () => {
		const h = await connected();
		h.sockets[0].disconnect(4000);
		h.shard.stop();
		await h.clock.advance(60_000);
		expect(h.sockets).toHaveLength(1);
		expect(h.clock.pending).toBe(0);
	});

	test("binary JSON is accepted and duplicate or older sequence is ignored", async () => {
		const h = await connected();
		h.sockets[0].raw(
			new TextEncoder().encode(
				JSON.stringify({ op: 0, t: "CUSTOM_EVENT", d: {}, s: 6 }),
			).buffer,
		);
		h.sockets[0].receive({ op: 0, t: "CUSTOM_EVENT", d: {}, s: 6 });
		h.sockets[0].receive({ op: 0, t: "CUSTOM_EVENT", d: {}, s: 5 });
		expect(h.events.map((packet) => packet.s)).toEqual([4, 6]);
	});

	test("malformed frame reconnects instead of reaching dispatch", async () => {
		const h = await connected();
		h.sockets[0].raw("{broken");
		expect(h.shard.state).toBe("reconnecting");
		expect(h.events).toHaveLength(1);
	});
});

describe("gateway protocol", () => {
	test("rejects unsupported binary, invalid UTF-8, oversized bytes and unsafe sequences", () => {
		for (const data of [
			new Uint8Array([1]),
			new Uint8Array([255]).buffer,
			"ééé",
		]) {
			expect(() => decodeFrame(data, 4)).toThrow();
		}
		for (const s of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, null]) {
			expect(() =>
				decodeFrame(
					JSON.stringify({ op: 0, t: "CUSTOM_EVENT", d: {}, s }),
					1000,
				),
			).toThrow();
		}
		expect(() =>
			decodeFrame(
				JSON.stringify({ op: 10, d: { heartbeat_interval: 0 } }),
				1000,
			),
		).toThrow();
		expect(() =>
			decodeFrame(JSON.stringify({ op: 9, d: "true" }), 1000),
		).toThrow();
		expect(() => gatewayURL("ws://remote.example.test")).toThrow();
	});
});

describe("IdentifyGate", () => {
	test("enforces cooldown, refuses exhausted budget and replenishes after reset", async () => {
		const clock = new FakeClock();
		const gate = new IdentifyGate(clock, {
			total: 2,
			remaining: 2,
			reset_after: 20_000,
			max_concurrency: 1,
		});
		const signal = new AbortController().signal;
		await gate.acquire(signal);
		let acquired = false;
		const second = gate.acquire(signal).then(() => {
			acquired = true;
		});
		await clock.advance(4999);
		expect(acquired).toBe(false);
		await clock.advance(1);
		await second;
		const exhausted = gate.acquire(signal);
		void exhausted.catch(() => {});
		await clock.advance(5000);
		await expect(exhausted).rejects.toThrow("budget exhausted");
		await clock.advance(10_000);
		await gate.acquire(signal);
	});

	test("abort cancels cooldown without consuming a permit", async () => {
		const clock = new FakeClock();
		const gate = new IdentifyGate(clock, {
			total: 2,
			remaining: 2,
			reset_after: 60_000,
			max_concurrency: 1,
		});
		await gate.acquire(new AbortController().signal);
		const controller = new AbortController();
		const waiting = gate.acquire(controller.signal);
		controller.abort(new Error("cancelled"));
		await expect(waiting).rejects.toThrow("cancelled");
		expect(clock.pending).toBe(0);
		await clock.advance(5000);
		await gate.acquire(new AbortController().signal);
	});

	test("concurrent waiters retain the five-second spacing", async () => {
		const clock = new FakeClock();
		const gate = new IdentifyGate(clock, {
			total: 3,
			remaining: 3,
			reset_after: 60_000,
			max_concurrency: 1,
		});
		const signal = new AbortController().signal;
		await gate.acquire(signal);
		const acquired: number[] = [];
		const first = gate.acquire(signal).then(() => {
			acquired.push(clock.now());
		});
		const second = gate.acquire(signal).then(() => {
			acquired.push(clock.now());
		});
		await clock.advance(5000);
		expect(acquired).toEqual([5000]);
		await clock.advance(5000);
		await Promise.all([first, second]);
		expect(acquired).toEqual([5000, 10_000]);
	});
});
