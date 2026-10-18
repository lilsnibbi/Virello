import { afterEach, describe, expect, test } from "bun:test";
import { createBot } from "../../examples/client";
import { formatStats } from "../../examples/stats";
import { ShardError } from "../../src/sharding/types";

const previousGuildId = Bun.env.DEV_GUILD_ID;
afterEach(() => {
	if (previousGuildId === undefined) delete Bun.env.DEV_GUILD_ID;
	else Bun.env.DEV_GUILD_ID = previousGuildId;
});

describe("example bot", () => {
	test("loads every command and the ready listener; only shard 0 registers commands", async () => {
		Bun.env.DEV_GUILD_ID = "";
		const client = createBot();
		try {
			await client.load();
			const commands = client.modules.require("commands");
			expect([...commands.keys()].sort()).toEqual(["ping", "shard", "stats"]);
			expect(client.modules.require("listeners").has("ready")).toBe(true);
			let shard = 1;
			Object.defineProperty(client.sharding, "id", { get: () => shard });
			for (const command of commands.values()) {
				command.registerApplicationCommands?.(
					command.applicationCommandRegistry,
				);
				expect(command.applicationCommandRegistry.chatInputCommands.size).toBe(
					0,
				);
			}
			shard = 0;
			for (const command of commands.values()) {
				command.registerApplicationCommands?.(
					command.applicationCommandRegistry,
				);
				expect(
					command.applicationCommandRegistry.chatInputCommands.has(
						command.name,
					),
				).toBe(true);
			}
		} finally {
			await client.destroy();
		}
	});

	test("partial stats report failed shards and count only responding servers", () => {
		const reply = formatStats([
			{
				shard: 0,
				ok: true,
				value: {
					shard: 0,
					pid: 1,
					guilds: 4,
					memoryMb: 60,
					uptimeSeconds: 10,
					ready: true,
					commands: ["ping", "shard", "stats"],
				},
			},
			{
				shard: 1,
				ok: false,
				error: new ShardError("DISCONNECTED", "Host disconnected."),
			},
		]);
		expect(reply).toContain(
			"1/2 shards responded; 4 servers on responding shards.",
		);
		expect(reply).toContain("Shard 1: unavailable (DISCONNECTED)");
	});
});
