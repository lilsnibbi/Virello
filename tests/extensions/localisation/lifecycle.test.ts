import { afterEach, expect, spyOn, test } from "bun:test";
import { ApplicationCommands } from "../../../packages/core/src/discord/ApplicationCommands";
import { RestClient } from "../../../packages/rest/src/RestClient";
import { DiscordRuntime } from "../../../packages/core/src/core/client/DiscordRuntime";
import * as Virello from "virello";
import {
	ApplicationCommandRegistry,
	Command,
	container,
	VirelloClient,
	type LoggerLike,
} from "virello";
import { handleRegistryAPICalls } from "../../../packages/core/src/commands/registration/registries";

let client: VirelloClient | undefined;
const restores: (() => void)[] = [];
afterEach(async () => {
	for (const restore of restores.splice(0)) restore();
	await client?.destroy();
	client = undefined;
});
function logger() {
	const errors: unknown[] = [],
		alerts: unknown[] = [];
	const value: LoggerLike = {
		debug() {},
		notif() {},
		alert: (v) => alerts.push(v),
		error: (v) => errors.push(v),
	};
	return { value, errors, alerts };
}

test("editable re-execution exports/config/listeners are removed while ordinary message handling remains", async () => {
	expect("EditExtension" in Virello).toBe(false);
	expect(
		() =>
			new VirelloClient({
				intents: [],
				extensions: { editableReplies: {} },
			} as never),
	).toThrow("Unknown built-in extension");
	client = new VirelloClient({ intents: [], messageCommands: true });
	await client.load();
	expect(client.extensions).toHaveLength(5);
	expect(client.modules.require("listeners").has("EditableMessageUpdate")).toBe(
		false,
	);
	expect(client.listenerCount("messageCreate")).toBeGreaterThan(0);
	expect(client.listenerCount("messageUpdate")).toBe(0);
});

test("login loads the default-enabled local manager before the Discord transport hook runs", async () => {
	const hook = spyOn(DiscordRuntime.prototype, "login").mockImplementation(
		async () => {
			expect(container.i18n.languagesLoaded).toBe(true);
			expect(container.i18n.format("fr", "hello")).toBe("bonjour");
			return "local-test";
		},
	);
	restores.push(() => hook.mockRestore());
	client = new VirelloClient({
		intents: [],
		extensions: {
			localisation: {
				i18next: { resources: { fr: { default: { hello: "bonjour" } } } },
			},
		},
	});
	expect(container.i18n.languagesLoaded).toBe(false);
	await client.login("local-test");
	expect(hook).toHaveBeenCalledTimes(1);
});

test("invalid localisation engine configuration follows recoverable extension failure without hiding the cause", async () => {
	const logs = logger();
	const hook = spyOn(DiscordRuntime.prototype, "login").mockResolvedValue(
		"local-test",
	);
	restores.push(() => hook.mockRestore());
	client = new VirelloClient({
		intents: [],
		logger: logs.value,
		extensions: { localisation: { i18next: { saveMissing: true } } },
	});
	const manager = container.i18n;
	await client.login("local-test");
	expect(logs.errors).toHaveLength(1);
	expect(logs.errors[0]).toBeInstanceOf(Error);
	expect(manager.languagesLoaded).toBe(false);
	expect(container.i18n).toBeUndefined();
	const registry = new ApplicationCommandRegistry("bad");
	expect(() =>
		registry.registerChatInputCommand(
			{ name: "bad", description: "Bad" },
			{ localisation: "bad" },
		),
	).toThrow("requires");
	expect(registry["apiCalls"]).toHaveLength(0);
});

test("native command client serialises translated registry payloads for global/guild REST and retains returned ID routing", async () => {
	const logs = logger();
	client = new VirelloClient({
		intents: [],
		logger: logs.value,
		extensions: {
			localisation: {
				i18next: {
					resources: {
						fr: {
							default: {
								name: "bonjour",
								description: "Description française",
								option: "salutation",
								choice: "Choix",
							},
						},
					},
				},
			},
		},
	});
	await container.i18n.init();
	Object.defineProperty(client, "application", {
		value: { id: "123456789012345678" },
		configurable: true,
	});
	const sent: unknown[] = [];
	const rest = new RestClient("offline-placeholder", { maxRetries: 0 });
	client.addDisposer(() => rest.close());
	const post = spyOn(rest, "request").mockImplementation(
		async <T>(
			options: import("../../../packages/rest/src/RestClient").$RestRequest,
		): Promise<T> => {
			const route = options.path;
			sent.push({ route, body: structuredClone(options?.body) });
			return {
				...JSON.parse(JSON.stringify(options?.body)),
				id: "123456789012345679",
				application_id: "123456789012345678",
				version: "123456789012345680",
			} as T;
		},
	);
	restores.push(() => post.mockRestore());
	const registry = new ApplicationCommandRegistry("hello");
	registry.registerChatInputCommand(
		(builder) =>
			builder
				.setName("hello")
				.setDescription("Say hello")
				.addStringOption((o) =>
					o
						.setName("greeting")
						.setDescription("Greeting")
						.addChoices({ name: "Choice", value: "stable" }),
				),
		{
			localisation: {
				name: "name",
				description: "description",
				options: {
					greeting: {
						name: "option",
						choices: [{ value: "stable", name: "choice" }],
					},
				},
			},
		},
	);
	await registry["runAPICalls"](
		new ApplicationCommands(rest, "123456789012345678"),
		new Map(),
		new Map(),
	);
	expect(post).toHaveBeenCalledTimes(1);
	expect(sent[0]).toMatchObject({
		route: "/applications/123456789012345678/commands",
		body: {
			name: "hello",
			name_localizations: { fr: "bonjour" },
			options: [
				{
					name: "greeting",
					name_localizations: { fr: "salutation" },
					choices: [
						{
							name: "Choice",
							value: "stable",
							name_localizations: { fr: "Choix" },
						},
					],
				},
			],
		},
	});
	expect(registry.globalChatInputCommandIds.has("123456789012345679")).toBe(
		true,
	);
	expect(registry.chatInputCommands.has("bonjour")).toBe(false);
	const guild = new ApplicationCommandRegistry("guild");
	guild.registerChatInputCommand(
		{ name: "guild", description: "Guild" },
		{ guildIds: ["123456789012345681"], localisation: { name: "name" } },
	);
	await guild["runAPICalls"](
		new ApplicationCommands(rest, "123456789012345678"),
		new Map(),
		new Map(),
	);
	expect(sent[1]).toMatchObject({
		route:
			"/applications/123456789012345678/guilds/123456789012345681/commands",
		body: { name: "guild", name_localizations: { fr: "bonjour" } },
	});
	expect(logs.errors.map((error) => (error as Error).cause)).toEqual([]);
});

test("strict translation errors isolate their command while other commands reach the mocked REST boundary", async () => {
	const logs = logger();
	client = new VirelloClient({
		intents: [],
		logger: logs.value,
		extensions: {
			localisation: {
				discord: { strict: true },
				i18next: { resources: { fr: { default: { good: "valide" } } } },
			},
		},
	});
	await container.i18n.init();
	class Bad extends Command {
		override registerApplicationCommands(registry: Command.Registry) {
			registry.registerChatInputCommand(
				{ name: "bad", description: "Bad" },
				{ localisation: { name: "missing" } },
			);
		}
	}
	class Good extends Command {
		override registerApplicationCommands(registry: Command.Registry) {
			registry.registerChatInputCommand(
				{ name: "good", description: "Good" },
				{ localisation: { name: "good" } },
			);
		}
	}
	await client.modules.addModule({
		store: "commands",
		name: "bad",
		module: Bad,
	});
	await client.modules.addModule({
		store: "commands",
		name: "good",
		module: Good,
	});
	await client.load();
	const created: string[] = [];
	Object.defineProperty(client, "application", {
		value: {
			commands: {
				fetch: async () => new Map(),
				create: async (data: { name: string }) => {
					created.push(data.name);
					return { id: "123456789012345679" };
				},
			},
		},
		configurable: true,
	});
	await handleRegistryAPICalls();
	expect(created).toEqual(["good"]);
	expect(logs.errors).toHaveLength(1);
	expect(logs.alerts).toHaveLength(1);
	expect(
		client.modules.require("commands").get("bad")!.applicationCommandRegistry[
			"apiCalls"
		],
	).toHaveLength(0);
});
