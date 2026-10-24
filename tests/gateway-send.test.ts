import { expect, test } from "bun:test";
import { EngineClient } from "@virello/engine/client";
import {
	GatewayShard,
	type $GatewayCommand,
	type $GatewayOptions,
	type $GatewaySocket,
} from "../packages/ws/src/index";
import { DiscordAPI } from "virello";
import type { $Clock } from "@virello/util/runtime";

const {
	GatewayDispatchEvents: E,
	GatewayIntentBits: Intent,
	GatewayOpcodes: Op,
	PresenceUpdateStatus,
} = DiscordAPI;

class Clock implements $Clock {
	private time = 0;
	private id = 0;
	private readonly timers = new Map<
		number,
		{ at: number; callback: () => void }
	>();
	public now = () => this.time;
	public random = () => 0.5;
	public setTimeout(callback: () => void, milliseconds: number): number {
		const id = ++this.id;
		this.timers.set(id, { at: this.time + milliseconds, callback });
		return id;
	}
	public clearTimeout(handle: unknown): void {
		this.timers.delete(handle as number);
	}
	public advance(milliseconds: number): void {
		const until = this.time + milliseconds;
		for (;;) {
			const next = [...this.timers]
				.filter(([, timer]) => timer.at <= until)
				.sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
			if (!next) break;
			this.time = next[1].at;
			this.timers.delete(next[0]);
			next[1].callback();
		}
		this.time = until;
	}
}

class Socket implements $GatewaySocket {
	public binaryType: BinaryType = "arraybuffer";
	public readyState: $GatewaySocket["readyState"] = WebSocket.OPEN;
	public onopen: WebSocket["onopen"] = null;
	public onmessage: WebSocket["onmessage"] = null;
	public onclose: WebSocket["onclose"] = null;
	public onerror: WebSocket["onerror"] = null;
	public readonly writes: { op: number; d: Record<string, unknown> }[] = [];
	public failNext = false;
	public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
		const packet = JSON.parse(String(data));
		this.writes.push(packet);
		if (this.failNext) {
			this.failNext = false;
			throw new Error("test socket failure");
		}
		if (packet.op === Op.Heartbeat)
			this.receive({ op: Op.HeartbeatAck, d: null });
	}
	public close(): void {
		this.readyState = WebSocket.CLOSED;
		this.onclose?.call(
			this as unknown as WebSocket,
			{ code: 1000 } as CloseEvent,
		);
	}
	public receive(packet: unknown): void {
		this.onmessage?.call(
			this as unknown as WebSocket,
			{ data: JSON.stringify(packet) } as MessageEvent,
		);
	}
	public commands(): { op: number; d: Record<string, unknown> }[] {
		return this.writes.filter((packet) =>
			[3, 4, 8, 31, 43].includes(packet.op),
		);
	}
}

const hello = { op: Op.Hello, d: { heartbeat_interval: 60000 } };
const ready = {
	op: Op.Dispatch,
	t: E.Ready,
	s: 1,
	d: {
		session_id: "test-session",
		resume_gateway_url: "wss://gateway.invalid",
		guilds: [],
	},
};
const members: $GatewayCommand = {
	op: Op.RequestGuildMembers,
	d: { guild_id: "8388608", query: "", limit: 0 },
};
const presence = (): $GatewayCommand => ({
	op: Op.PresenceUpdate,
	d: {
		since: null,
		activities: [],
		status: PresenceUpdateStatus.Online,
		afk: false,
	},
});
const channel: $GatewayCommand = {
	op: Op.RequestChannelInfo,
	d: { guild_id: "8388608", fields: ["status"] },
};

function harness(overrides: Partial<$GatewayOptions> = {}) {
	const clock = new Clock();
	const socket = new Socket();
	const shard = new GatewayShard(
		{
			token: "test-token",
			url: "wss://gateway.invalid",
			intents: Intent.GuildMembers,
			clock,
			socket: () => socket,
			identify: async () => {},
			...overrides,
		},
		{ dispatch: () => {}, reset: () => {}, failure: () => {} },
	);
	return {
		clock,
		socket,
		shard,
		async start() {
			const starting = shard.start();
			socket.receive(hello);
			await Promise.resolve();
			socket.receive(ready);
			await starting;
		},
	};
}

test("unsafe, malformed, oversized and wrong-shard commands never reach the socket", async () => {
	const h = harness({ shard: [0, 2], intents: 0 });
	try {
		await expect(h.shard.send(channel)).rejects.toThrow("ready");
		await h.start();
		const invalid = [
			{ op: Op.Identify, d: { token: "must-not-be-sent" } },
			{ op: Op.Heartbeat, d: null },
			{
				op: Op.RequestChannelInfo,
				d: { guild_id: "4194304", fields: ["status"] },
			},
			{
				op: Op.RequestSoundboardSounds,
				d: { guild_ids: ["8388608", "4194304"] },
			},
			{
				op: Op.VoiceStateUpdate,
				d: {
					guild_id: "8388608",
					channel_id: null,
					self_mute: "yes",
					self_deaf: false,
				},
			},
			{
				op: Op.PresenceUpdate,
				d: { since: null, activities: [], status: ["online"], afk: false },
			},
			{
				op: Op.PresenceUpdate,
				d: {
					since: null,
					activities: [{ name: "x".repeat(4096), type: 0 }],
					status: "online",
					afk: false,
				},
			},
			members,
		];
		for (const payload of invalid)
			await expect(h.shard.send(payload as $GatewayCommand)).rejects.toThrow();
		expect(h.socket.commands()).toHaveLength(0);
		expect(h.shard.state).toBe("ready");
		await h.shard.send({
			op: Op.RequestGuildMembers,
			d: { guild_id: "8388608", user_ids: ["1", "2"], nonce: "correlate" },
		});
		expect(h.socket.commands()[0].d.nonce).toBe("correlate");
	} finally {
		h.shard.stop();
	}
});

test("presence limits bound pending work and snapshot commands before they wait", async () => {
	const h = harness({ maxPendingSends: 1 });
	try {
		await h.start();
		for (let i = 0; i < 5; i++) await h.shard.send(presence());
		const payload = presence();
		if (payload.op !== Op.PresenceUpdate) throw new Error("test presence");
		payload.d.activities.push({ name: "original", type: 0 });
		const pending = h.shard.send(payload, { deadlineMs: 25000 });
		payload.d.activities[0].name = "changed";
		expect(h.shard.pendingSends).toBe(1);
		await expect(h.shard.send(presence())).rejects.toThrow("capacity");
		h.clock.advance(19999);
		expect(h.socket.commands()).toHaveLength(5);
		h.clock.advance(1);
		await pending;
		expect(h.socket.commands()[5].d.activities).toEqual([
			{ name: "original", type: 0 },
		]);
		expect(h.shard.pendingSends).toBe(0);
	} finally {
		h.shard.stop();
	}
});

test("member requests observe per-guild and server cooldowns without replaying the rejected request", async () => {
	const h = harness();
	try {
		await h.start();
		await h.shard.send(members);
		h.socket.receive({
			op: Op.Dispatch,
			t: E.RateLimited,
			s: 2,
			d: { opcode: 8, retry_after: 45, meta: { guild_id: "8388608" } },
		});
		const pending = h.shard.send(members, { deadlineMs: 50000 });
		h.clock.advance(30000);
		expect(h.socket.commands()).toHaveLength(1);
		h.clock.advance(15000);
		await pending;
		expect(h.socket.commands()).toHaveLength(2);
	} finally {
		h.shard.stop();
	}
});

test("cancelled, expired and disconnected queued requests produce no delayed effects", async () => {
	const h = harness();
	try {
		await h.start();
		await h.shard.send(members);
		const controller = new AbortController();
		const cancelled = h.shard.send(members, { signal: controller.signal });
		const cancelledCheck = cancelled.catch((error: unknown) => error);
		controller.abort(new Error("cancelled"));
		expect(await cancelledCheck).toMatchObject({ message: "cancelled" });
		const expired = h.shard.send(members, { deadlineMs: 10 });
		const expiredCheck = expired.catch((error: unknown) => error);
		h.clock.advance(10);
		expect(await expiredCheck).toMatchObject({
			message: expect.stringContaining("deadline"),
		});
		const disconnected = h.shard.send(members);
		const disconnectCheck = disconnected.catch((error: unknown) => error);
		h.socket.receive({ op: Op.Reconnect, d: null });
		expect(await disconnectCheck).toMatchObject({
			message: expect.stringContaining("replaced"),
		});
		await expect(h.shard.send(channel)).rejects.toThrow("ready");
		expect(h.socket.commands()).toHaveLength(1);
		expect(h.shard.pendingSends).toBe(0);
	} finally {
		h.shard.stop();
	}
});

test("application traffic reserves control capacity and respects the rolling connection limit", async () => {
	const h = harness();
	try {
		await h.start();
		for (let i = 0; i < 114; i++) await h.shard.send(channel);
		const pending = h.shard.send(channel, { deadlineMs: 61000 });
		expect(h.socket.writes).toHaveLength(115);
		h.socket.receive({ op: Op.Heartbeat, d: null });
		expect(h.socket.writes).toHaveLength(116);
		h.clock.advance(59999);
		expect(h.socket.commands()).toHaveLength(114);
		h.clock.advance(1);
		await pending;
		expect(h.socket.commands()).toHaveLength(115);
	} finally {
		h.shard.stop();
	}
});

test("a failed write remains unknown and is never queued for replay", async () => {
	const h = harness();
	try {
		await h.start();
		h.socket.failNext = true;
		await expect(h.shard.send(channel)).rejects.toThrow("unknown");
		expect(h.shard.state).toBe("reconnecting");
		expect(h.shard.pendingSends).toBe(0);
		expect(h.socket.commands()).toHaveLength(1);
	} finally {
		h.shard.stop();
	}
});

test("EngineClient exposes all five commands and revokes pending work on reassignment and close", async () => {
	const clock = new Clock();
	const socket = new Socket();
	const created = Promise.withResolvers<void>();
	const engine = new EngineClient({
		token: "test-token",
		intents: Intent.GuildMembers,
		clock,
		rest: {
			fetch: async () =>
				Response.json({
					url: "wss://gateway.invalid",
					shards: 1,
					session_start_limit: {
						total: 100,
						remaining: 100,
						reset_after: 60000,
						max_concurrency: 1,
					},
				}),
		},
		gateway: {
			socket: () => {
				created.resolve();
				return socket;
			},
		},
	});
	try {
		await expect(engine.sendGateway(channel)).rejects.toThrow("ready");
		const connecting = engine.connect();
		await created.promise;
		socket.receive(hello);
		for (let i = 0; i < 5; i++) await Promise.resolve();
		socket.receive(ready);
		await connecting;
		for (const payload of [
			presence(),
			{
				op: Op.VoiceStateUpdate,
				d: {
					guild_id: "8388608",
					channel_id: null,
					self_mute: false,
					self_deaf: false,
				},
			},
			members,
			{ op: Op.RequestSoundboardSounds, d: { guild_ids: ["8388608"] } },
			channel,
		] as $GatewayCommand[])
			await engine.sendGateway(payload);
		expect(socket.commands().map((packet) => packet.op)).toEqual([
			3, 4, 8, 31, 43,
		]);
		const pending = engine.sendGateway(members);
		const rejected = pending.catch((error: unknown) => error);
		expect(engine.pendingGatewaySends).toBe(1);
		engine.reassign(null);
		expect(await rejected).toMatchObject({
			message: expect.stringContaining("replaced"),
		});
		await expect(engine.sendGateway(channel)).rejects.toThrow("ready");
		engine.close();
		await expect(engine.sendGateway(presence())).rejects.toThrow("ready");
		expect(socket.commands()).toHaveLength(5);
	} finally {
		engine.close();
	}
});
