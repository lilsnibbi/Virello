import { expect, spyOn, test } from "bun:test";
import {
	Client,
	ClientPresence,
	Message,
	GatewayIntentBits,
	Partials,
	ActivityType,
} from "discord.js";
import {
	VirelloClient,
	type VirelloClientOptions,
	Events,
	Extension,
	container,
} from "virello";

const logger = { debug() {}, notif() {}, alert() {}, error() {} };
const options = {
	intents: [GatewayIntentBits.Guilds],
	logger,
	logRegistrations: false,
	logErrors: false,
	extensions: {
		scheduledtasks: false,
		services: false,
		patternCommands: false,
		subcommands: false,
		localisation: false,
	},
};

test("Virello owns a real discord.js client and accepts native shard and cache options", async () => {
	const client = new VirelloClient({
		...options,
		shards: [1],
		shardCount: 2,
		partials: [Partials.Channel],
	});
	try {
		expect(client).toBeInstanceOf(Client);
		for (const key of [
			"clock",
			"cache",
			"gateway",
			"maxPendingHandlers",
			"onError",
			"waitForIdentify",
		]) {
			expect(
				() =>
					new VirelloClient({ ...options, [key]: {} } as VirelloClientOptions),
			).toThrow(`no longer supports "${key}"`);
		}
		expect(client.options.shards).toEqual([1]);
		expect(client.options.shardCount).toBe(2);
		expect(client.options.partials).toEqual([Partials.Channel]);
		expect(client.ws.shards.size).toBe(0);
		expect(client.cluster).toBeUndefined();
		expect(client.crosshost).toBeUndefined();
		expect("engine" in client).toBe(false);
		await client.load();
		expect(client.modules.require("commands")).toBeDefined();
	} finally {
		await client.destroy();
	}
	expect(container.client).toBeUndefined();
});

test("presence updates use discord.js validation and its Gateway manager", async () => {
	const client = new VirelloClient(options);
	const broadcast = spyOn(client.ws, "broadcast").mockImplementation(() => {});
	try {
		expect(client.presence).toBeInstanceOf(ClientPresence);
		client.presence.set({
			status: "idle",
			activities: [{ name: "Support", type: ActivityType.Playing }],
		});
		expect(broadcast).toHaveBeenCalledTimes(1);
		expect(broadcast.mock.calls[0][0]).toMatchObject({
			op: 3,
			d: {
				status: "idle",
				activities: [{ name: "Support", type: ActivityType.Playing }],
			},
		});
		expect(() =>
			client.presence.set({ activities: [{ name: 123 as unknown as string }] }),
		).toThrow();
		expect(broadcast).toHaveBeenCalledTimes(1);
	} finally {
		broadcast.mockRestore();
		await client.destroy();
	}
});

test("Discord event handlers receive the original rich objects", async () => {
	const client = new VirelloClient(options);
	try {
		const message = new Message(client, {
			id: "123456789012345678",
			channel_id: "123456789012345679",
			content: "Hello",
			author: {
				id: "123456789012345670",
				username: "tester",
				discriminator: "0",
				avatar: null,
			},
			timestamp: new Date(0).toISOString(),
			attachments: [],
			embeds: [],
			mentions: [],
			mention_roles: [],
			components: [],
			type: 0,
		});
		let received: Message | undefined;
		client.once(Events.MessageCreate, (value) => {
			received = value;
		});
		client.emit(Events.MessageCreate, message);
		expect(received).toBe(message);
		expect(received!.author).toBe(client.users.cache.get(message.author.id));
		expect(typeof received!.react).toBe("function");
	} finally {
		await client.destroy();
	}
});

test("closed clients cannot reconnect or load modules", async () => {
	const client = new VirelloClient(options);
	const login = spyOn(Client.prototype, "login");
	try {
		await client.destroy();
		await expect(client.login("test-token")).rejects.toThrow("closed");
		await expect(client.load()).rejects.toThrow("closed");
		expect(login).not.toHaveBeenCalled();
	} finally {
		login.mockRestore();
	}
});

test("a failed Discord login releases framework resources and preserves the failure", async () => {
	const failure = new Error("Mock Gateway refused login");
	const login = spyOn(Client.prototype, "login").mockRejectedValue(failure);
	const client = new VirelloClient(options);
	let disposed = 0;
	client.addDisposer(() => {
		disposed++;
	});
	try {
		await expect(client.login("test-token")).rejects.toBe(failure);
		expect(disposed).toBe(1);
		expect(container.client).toBeUndefined();
		await client.destroy();
		expect(disposed).toBe(1);
	} finally {
		login.mockRestore();
		await client.destroy();
	}
});

test("extension failure before login prevents any Gateway connection", async () => {
	class FailedExtension extends Extension {
		static override critical = true;
		static override beforeLogin() {
			throw new Error("Startup failed");
		}
	}
	const login = spyOn(Client.prototype, "login");
	const client = new VirelloClient({
		...options,
		extensions: { ...options.extensions, custom: [FailedExtension] },
	});
	try {
		await expect(client.login("test-token")).rejects.toThrow(
			"Required extension",
		);
		expect(login).not.toHaveBeenCalled();
		expect(container.client).toBeUndefined();
	} finally {
		login.mockRestore();
		await client.destroy();
	}
});

test("repeated login shares one upstream connection and destroy shares one shutdown", async () => {
	const login = spyOn(Client.prototype, "login").mockResolvedValue(
		"test-token",
	);
	const client = new VirelloClient(options);
	let shutdowns = 0;
	client.on(Events.Shutdown, () => {
		shutdowns++;
	});
	try {
		const first = client.login("test-token");
		expect(client.login("test-token")).toBe(first);
		await first;
		expect(login).toHaveBeenCalledTimes(1);
		const stopped = client.destroy();
		expect(client.destroy()).toBe(stopped);
		await stopped;
		expect(shutdowns).toBe(1);
	} finally {
		login.mockRestore();
		await client.destroy();
	}
});
