import { expect, test } from "bun:test";
import type { APIInteraction, GuildMemberFlags } from "discord-api-types/v10";
import {
	ApplicationCommandType,
	ComponentType,
	GatewayDispatchEvents as E,
	InteractionType,
} from "discord-api-types/v10";
import { EngineClient } from "virello/engine";
import { MockDiscord } from "../../examples/engine/MockDiscord";
import { EngineInteraction } from "../../src/engine/client/EngineInteraction";
import { EventHub } from "../../src/engine/client/EventHub";
import { RestClient } from "../../src/engine/rest/RestClient";
import {
	dispatch,
	member,
	memberEvent,
	message,
	ready,
	user,
} from "./fixtures";
import { FakeClock, FakeSocket, flush } from "./support";

function interaction(
	type: InteractionType.ApplicationCommand | InteractionType.MessageComponent,
	id = "500",
): APIInteraction {
	const base = {
		id,
		application_id: "99",
		token: "local-interaction-token",
		version: 1,
		guild_id: "30",
		channel: { id: "20", type: 0 },
		channel_id: "20",
		locale: "en-US",
		guild_locale: "en-US",
		member: {
			...member("1"),
			user: user("1"),
			permissions: "0",
			flags: 0 as GuildMemberFlags,
		},
		app_permissions: "0",
		entitlements: [],
		authorizing_integration_owners: { "0": "30" },
		context: 0,
		attachment_size_limit: 10_000_000,
	};
	return {
		...base,
		type,
		data:
			type === InteractionType.ApplicationCommand
				? { id: "501", name: "ping", type: ApplicationCommandType.ChatInput }
				: { custom_id: "button", component_type: ComponentType.Button },
	} as APIInteraction;
}

async function harness(
	options: {
		maxPendingHandlers?: number;
		cache?: ConstructorParameters<typeof EngineClient>[0]["cache"];
	} = {},
	memberRead?: () => Promise<Response>,
) {
	const clock = new FakeClock();
	const sockets: FakeSocket[] = [];
	const errors: Error[] = [];
	let reads = 0;
	const client = new EngineClient({
		token: "fake-token",
		intents: 0,
		clock,
		...options,
		onError: (failure) => errors.push(failure.error),
		rest: {
			fetch: async (url) => {
				if (memberRead && String(url).includes("/members/"))
					return memberRead();
				reads++;
				return Response.json({
					url: "wss://initial.example.test",
					shards: 1,
					session_start_limit: {
						total: 100,
						remaining: 100,
						reset_after: 100_000,
						max_concurrency: 1,
					},
				});
			},
		},
		gateway: {
			socket: () => {
				const socket = new FakeSocket();
				sockets.push(socket);
				return socket;
			},
		},
	});
	const connected = client.connect();
	await flush();
	const socket = sockets[0];
	if (!socket) throw new Error("No socket.");
	socket.receive({ op: 10, d: { heartbeat_interval: 1000 } });
	await flush();
	socket.receive(dispatch(E.Ready, ready(), 1));
	await connected;
	return { client, socket, clock, errors, reads: () => reads };
}

test("cache mutation precedes handlers, async handlers overlap and live objects change across await", async () => {
	const { client, socket, clock, reads } = await harness({
		cache: { messagesPerChannel: 10 },
	});
	const barrier = Promise.withResolvers<void>();
	const seen: string[] = [];
	client.on("messageCreate", async (event) => {
		expect(client.cache.messages.peek("20", "100")?.data).toBe(event.data);
		seen.push(event.data.content);
		await barrier.promise;
		seen.push(event.data.content);
	});
	client.on("messageUpdate", (event) => {
		expect(event.cached?.data.content).toBe("changed");
		seen.push("updated");
	});
	socket.receive(dispatch(E.MessageCreate, message(), 2));
	socket.receive(
		dispatch(
			E.MessageUpdate,
			{ id: "100", channel_id: "20", content: "changed" },
			3,
		),
	);
	expect(seen).toEqual(["!ping", "updated"]);
	expect(client.pendingHandlers).toBe(1);
	expect(client.cache.members.get("30", "404")).toBeUndefined();
	expect(reads()).toBe(1);
	barrier.resolve();
	await client.idle();
	expect(seen).toEqual(["!ping", "updated", "changed"]);
	client.close();
	expect(clock.pending).toBe(0);
});

test("member recency covers slash commands and button presses; delete handlers observe removal", async () => {
	const { client, socket } = await harness({
		cache: { membersPerGuild: 2, messagesPerChannel: 3 },
	});
	try {
		socket.receive({ ...memberEvent("1"), s: 2 });
		socket.receive({ ...memberEvent("2"), s: 3 });
		socket.receive(
			dispatch(
				E.InteractionCreate,
				interaction(InteractionType.ApplicationCommand),
				4,
			),
		);
		socket.receive({ ...memberEvent("3"), s: 5 });
		expect(client.cache.members.peek("30", "2")).toBeUndefined();
		socket.receive(
			dispatch(
				E.InteractionCreate,
				interaction(InteractionType.MessageComponent),
				6,
			),
		);
		socket.receive({ ...memberEvent("4"), s: 7 });
		expect(client.cache.members.peek("30", "3")).toBeUndefined();
		const previous = client.cache.members.peek("30", "1");
		let removed = false;
		client.on("cacheDelete", (event) => {
			expect(client.cache.members.peek("30", "1")).toBeUndefined();
			expect(event.previous).toBe(previous);
			expect(event.payload.t).toBe(E.GuildMemberRemove);
			removed = true;
		});
		socket.receive(
			dispatch(E.GuildMemberRemove, { guild_id: "30", user: user("1") }, 8),
		);
		expect(removed).toBe(true);
	} finally {
		client.close();
	}
});

test("handler errors are contained; pending overflow stops the client without an unbounded queue", async () => {
	const { client, socket, errors, clock } = await harness({
		maxPendingHandlers: 1,
	});
	client.on("messageCreate", () => {
		throw new Error("sync handler");
	});
	socket.receive(dispatch(E.MessageCreate, message("100"), 2));
	expect(errors.map((error) => error.message)).toContain("sync handler");
	const barrier = Promise.withResolvers<void>();
	client.on("messageCreate", () => barrier.promise);
	socket.receive(dispatch(E.MessageCreate, message("101"), 3));
	socket.receive(dispatch(E.MessageCreate, message("102"), 4));
	expect(client.state).toBe("closed");
	expect(client.pendingHandlers).toBe(1);
	expect(clock.pending).toBe(0);
	expect(errors.some((error) => error.message.includes("capacity"))).toBe(true);
	barrier.reject(new Error("late handler rejection"));
	await client.idle();
	expect(client.pendingHandlers).toBe(0);
});

test("event unsubscribe and async rejection reporting preserve subsequent callbacks", async () => {
	const errors: Error[] = [];
	const hub = new EventHub<{ event: number }>(10, (error) =>
		errors.push(error),
	);
	const received: number[] = [];
	const off = hub.on("event", async () => {
		throw new Error("async error");
	});
	hub.on("event", (value) => {
		received.push(value);
	});
	hub.emit("event", 1);
	await hub.idle();
	off();
	hub.emit("event", 2);
	expect(received).toEqual([1, 2]);
	expect(errors.map((error) => error.message)).toEqual(["async error"]);
	hub.close();
	expect(() => hub.on("event", () => {})).toThrow("closed");
});

test("repeating an old unsubscribe preserves replacement event listeners", () => {
	const hub = new EventHub<{ event: number }>(10, () => {});
	const off = hub.on("event", () => {});
	off();
	const received: number[] = [];
	hub.on("event", (value) => {
		received.push(value);
	});
	off();
	hub.emit("event", 2);
	expect(received).toEqual([2]);
	hub.close();
});

test("initial interaction responses cannot race; native body is passed unchanged", async () => {
	const release = Promise.withResolvers<Response>();
	let body: unknown;
	let authorization: string | null = null;
	const rest = new RestClient("fake", {
		fetch: async (_url, init) => {
			body = JSON.parse(String(init?.body)) as unknown;
			authorization = new Headers(init?.headers).get("Authorization");
			return release.promise;
		},
	});
	try {
		const event = new EngineInteraction(
			interaction(InteractionType.ApplicationCommand),
			rest,
		);
		const first = event.reply({
			content: "hello",
			allowed_mentions: { parse: [] },
			flags: 64,
		});
		await expect(event.reply({ content: "duplicate" })).rejects.toThrow(
			"already pending",
		);
		release.resolve(new Response(null, { status: 204 }));
		await first;
		expect(event.replyState).toBe("answered");
		expect(body).toEqual({
			type: 4,
			data: { content: "hello", allowed_mentions: { parse: [] }, flags: 64 },
		});
		expect(authorization).toBeNull();
	} finally {
		rest.close();
	}
});

test("ambiguous interaction failures stay consumed; definitive rejections allow a corrected response", async () => {
	for (const status of [400, 500]) {
		const rest = new RestClient("fake", {
			fetch: async () => Response.json({ message: "fixture" }, { status }),
		});
		const event = new EngineInteraction(
			interaction(InteractionType.MessageComponent),
			rest,
		);
		await expect(event.reply({ content: "hello" })).rejects.toThrow();
		expect(event.replyState).toBe(status === 400 ? "unanswered" : "unknown");
		rest.close();
	}
});

test("native loopback connects, replies through own REST, caches and resumes", async () => {
	const server = new MockDiscord();
	const client = new EngineClient({
		token: "loopback-fake",
		intents: 0,
		rest: { baseURL: server.baseURL },
		cache: { messagesPerChannel: 2 },
		onError: () => {},
	});
	const reply = Promise.withResolvers<void>();
	const resumed = Promise.withResolvers<void>();
	client.on("messageCreate", async (event) => {
		expect(client.cache.messages.get("20", "100")?.data).toBe(event.data);
		await event.reply({
			content: "native reply",
			allowed_mentions: { parse: [] },
		});
		reply.resolve();
	});
	client.on("resumed", () => resumed.resolve());
	try {
		await client.connect();
		server.dispatch("MESSAGE_CREATE", MockDiscord.message());
		await reply.promise;
		server.reconnect();
		await resumed.promise;
		expect(server.sentMessages).toEqual([
			{
				content: "native reply",
				allowed_mentions: { parse: [] },
				message_reference: { message_id: "100", channel_id: "20" },
			},
		]);
		expect(server.connections).toBe(2);
		expect(client.cache.messages.peek("20", "100")?.data.content).toBe(
			"!engine-ping",
		);
		expect(client.state).toBe("ready");
	} finally {
		client.close();
		await server.stop();
	}
}, 5000);

test("explicit fetch preserves a resident identity, and cache misses make no implicit request", async () => {
	let calls = 0;
	const client = new EngineClient({
		token: "test-secret-do-not-serialize",
		intents: 0,
		rest: {
			fetch: async () => {
				calls++;
				return Response.json({ ...member("1"), nick: null });
			},
		},
	});
	try {
		expect(JSON.stringify(client)).not.toContain(
			"test-secret-do-not-serialize",
		);
		expect(client.cache.members.get("30", "1")).toBeUndefined();
		expect(calls).toBe(0);
		client.cache.putMember("30", "1", member("1"));
		const before = client.cache.members.peek("30", "1");
		if (!before?.complete) throw new Error("Missing full fixture.");
		expect(await client.fetchMember("30", "1")).toBe(before.data);
		expect(before.data.nick).toBeNull();
		expect(calls).toBe(1);
	} finally {
		client.close();
	}
});

test("a concurrent gateway deletion prevents stale explicit fetch writeback", async () => {
	const response = Promise.withResolvers<Response>();
	const { client, socket } = await harness({}, () => response.promise);
	try {
		client.cache.putMember("30", "1", member("1"));
		const pending = client.fetchMember("30", "1");
		await flush();
		socket.receive(
			dispatch(E.GuildMemberRemove, { guild_id: "30", user: user("1") }, 2),
		);
		response.resolve(Response.json(member("1")));
		expect((await pending).user?.id).toBe("1");
		expect(client.cache.members.peek("30", "1")).toBeUndefined();
	} finally {
		client.close();
	}
});

test("closing from the connecting state callback never constructs a socket", async () => {
	let sockets = 0;
	const client = new EngineClient({
		token: "test",
		intents: 0,
		rest: {
			fetch: async () =>
				Response.json({
					url: "wss://example.test",
					shards: 1,
					session_start_limit: {
						total: 10,
						remaining: 10,
						reset_after: 1000,
						max_concurrency: 1,
					},
				}),
		},
		gateway: {
			socket: () => {
				sockets++;
				return new FakeSocket();
			},
		},
	});
	client.on("gatewayState", (state) => {
		if (state === "connecting") client.close();
	});
	await expect(client.connect()).rejects.toThrow("closed");
	expect(sockets).toBe(0);
});

test("VirelloClient uses its native engine without a standalone engine changing the container", async () => {
	const { VirelloClient, container } = await import("virello/client");
	const server = new MockDiscord();
	const framework = new VirelloClient({
		intents: [],
		logger: { debug() {}, notif() {}, alert() {}, error() {} },
		rest: { baseURL: server.baseURL },
		cache: { messagesPerChannel: 2 },
	});
	const engine = new EngineClient({ token: "offline-test", intents: 0 });
	try {
		await framework.load();
		expect(container.client).toBe(framework);
		expect(framework.modules.require("commands")).toBeDefined();
		expect(engine.state).toBe("idle");
		engine.close();
		expect(container.client).toBe(framework);
		const replied = Promise.withResolvers<void>();
		framework.once("messageCreate", async (context) => {
			try {
				expect(context.client).toBe(framework);
				expect(framework.cache.messages.peek("20", "100")?.data).toBe(
					context.data,
				);
				await context.reply("Framework reply");
				replied.resolve();
			} catch (error) {
				replied.reject(error);
			}
		});
		await framework.login("loopback-fake");
		expect(framework.engine).toBeInstanceOf(EngineClient);
		expect(framework.engine.cache).toBe(framework.cache);
		expect(framework.rest).toBe(framework.engine.rest);
		expect(framework.isReady()).toBe(true);
		server.dispatch("MESSAGE_CREATE", MockDiscord.message());
		await replied.promise;
		expect(server.sentMessages[0]).toMatchObject({
			content: "Framework reply",
		});
		const answered = Promise.withResolvers<void>();
		framework.once("interactionCreate", async (context) => {
			try {
				expect(context.user.id).toBe("1");
				expect(context.guildId).toBeNull();
				await context.reply("Native interaction");
				expect(context.replied).toBe(true);
				await expect(context.reply("Duplicate")).rejects.toThrow();
				answered.resolve();
			} catch (error) {
				answered.reject(error);
			}
		});
		const directInteraction = interaction(InteractionType.MessageComponent);
		Reflect.deleteProperty(directInteraction, "member");
		Reflect.deleteProperty(directInteraction, "guild_id");
		Reflect.deleteProperty(directInteraction, "guild_locale");
		Reflect.set(directInteraction, "user", user("1"));
		Reflect.set(directInteraction, "channel", { id: "20", type: 1 });
		server.dispatch("INTERACTION_CREATE", directInteraction);
		await answered.promise;
		expect(server.callbacks).toHaveLength(1);
	} finally {
		engine.close();
		await framework.destroy();
		await server.stop();
	}
});
