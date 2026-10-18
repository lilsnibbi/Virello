import { afterEach, expect, test } from "bun:test";
import { ApplicationCommandType } from "discord-api-types/v10";
import { ApplicationCommands } from "../../../src/discord/ApplicationCommands";
import { RestClient } from "../../../src/engine/rest/RestClient";
import { Command, VirelloClient } from "virello";
import {
	handleBulkOverwrite,
	setBulkOverwriteRetries,
} from "../../../src/commands/registration/registries";

let client: VirelloClient | undefined;
afterEach(async () => {
	await client?.destroy();
	client = undefined;
	setBulkOverwriteRetries(null);
});

for (const guildId of [undefined, "123456789012345681"]) {
	test(`bulk registration retries a failed ${guildId ? "guild" : "global"} overwrite before storing its returned ID`, async () => {
		client = new VirelloClient({
			intents: [],
			logger: { debug() {}, notif() {}, alert() {}, error() {} },
		});
		await client.load();
		const store = client.modules.require("commands");
		await store.addModule({ name: "retry", module: Command });
		const command = store.get("retry")!;
		command.applicationCommandRegistry.registerChatInputCommand(
			{ name: "retry", description: "Retry" },
			guildId ? { guildIds: [guildId] } : {},
		);
		Object.defineProperty(client, "application", {
			value: { id: "123456789012345678" },
			configurable: true,
		});
		let attempts = 0;
		const rest = new RestClient("offline-placeholder", {
			maxRetries: 0,
			fetch: async (_url, request) => {
				const body = JSON.parse(String(request?.body)) as Record<
					string,
					unknown
				>[];
				if (!body.length) return Response.json([]);
				if (++attempts === 1) throw new Error("temporary registration failure");
				return Response.json([
					{
						...body[0],
						id: "123456789012345690",
						application_id: "123456789012345678",
						version: "123456789012345680",
					},
				]);
			},
		});
		client.addDisposer(() => rest.close());
		setBulkOverwriteRetries(2);
		await handleBulkOverwrite(
			store,
			new ApplicationCommands(rest, "123456789012345678"),
		);
		expect(attempts).toBe(2);
		expect(store.get("123456789012345690")?.name).toBe("retry");
	});
}

for (const guildId of [undefined, "123456789012345681"]) {
	test(`bulk registration routes identical names by command type in ${guildId ? "guild" : "global"} scope`, async () => {
		client = new VirelloClient({
			intents: [],
			logger: { debug() {}, notif() {}, alert() {}, error() {} },
		});
		await client.load();
		const store = client.modules.require("commands");
		for (const name of ["slash", "user", "message"])
			await store.addModule({ name, module: Command });
		const slash = store.get("slash")!;
		const user = store.get("user")!;
		const message = store.get("message")!;
		const options = guildId ? { guildIds: [guildId] } : {};
		slash.applicationCommandRegistry.registerChatInputCommand(
			{ name: "inspect", description: "Inspect" },
			options,
		);
		user.applicationCommandRegistry.registerContextMenuCommand(
			{ name: "inspect", type: ApplicationCommandType.User },
			options,
		);
		message.applicationCommandRegistry.registerContextMenuCommand(
			{ name: "inspect", type: ApplicationCommandType.Message },
			options,
		);
		Object.defineProperty(client, "application", {
			value: { id: "123456789012345678" },
			configurable: true,
		});
		const rest = new RestClient("offline-placeholder", {
			maxRetries: 0,
			fetch: async (_url, request) => {
				const body = JSON.parse(String(request?.body)) as Record<
					string,
					unknown
				>[];
				return Response.json(
					body.map((data, index) => ({
						...data,
						id: String(123456789012345690n + BigInt(index)),
						application_id: "123456789012345678",
						guild_id: guildId,
						version: "123456789012345680",
					})),
				);
			},
		});
		client.addDisposer(() => rest.close());
		await handleBulkOverwrite(
			store,
			new ApplicationCommands(rest, "123456789012345678"),
		);
		expect(store.get("123456789012345690")).toBe(slash);
		expect(store.get("123456789012345691")).toBe(user);
		expect(store.get("123456789012345692")).toBe(message);
	});
}
