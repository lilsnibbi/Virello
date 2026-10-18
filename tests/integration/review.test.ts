import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { DiscordRuntime } from "../../src/core/client/DiscordRuntime";
import {
	ApplyOptions,
	Command,
	container,
	Extension,
	VirelloClient,
	Logger,
	type LoggerLike,
	Module,
	ModuleStore,
	Task,
} from "virello";

declare module "virello" {
	interface ModuleStores {
		reviewOwned: ModuleStore<Module, "reviewOwned">;
	}
}
let client: VirelloClient | undefined;
const dirs: string[] = [];
afterEach(async () => {
	await client?.destroy().catch(() => {});
	client = undefined;
	for (const dir of dirs.splice(0)) {
		if (!resolve(dir).startsWith(resolve(import.meta.dir) + sep))
			throw new Error("Unsafe test directory");
		rmSync(dir, { recursive: true, force: true });
	}
});
function logger() {
	const logs = {
		debug: [] as unknown[],
		notif: [] as unknown[],
		alert: [] as unknown[],
		error: [] as unknown[],
	};
	const instance: LoggerLike = {
		debug(value) {
			logs.debug.push(value);
		},
		notif(value) {
			logs.notif.push(value);
		},
		alert(value) {
			logs.alert.push(value);
		},
		error(value) {
			logs.error.push(value);
		},
	};
	return { instance, logs };
}

describe("review configuration and ownership", () => {
	test("uses the published default logger and preserves a supplied logger", async () => {
		client = new VirelloClient({
			intents: [],
			loggerOptions: { name: "Created by Virello", silent: true },
		});
		expect(client.logger).toBeInstanceOf(Logger);
		await client.destroy();
		const supplied = new Logger({
			name: "Existing application",
			silent: true,
			level: "ERROR",
			includeTimestamps: false,
		});
		const close = spyOn(supplied, "close");
		client = new VirelloClient({
			intents: [],
			logger: supplied,
			loggerOptions: { name: "Must be ignored" },
		});
		expect(client.logger).toBe(supplied);
		expect(container.logger).toBe(supplied);
		await client.destroy();
		expect(close).not.toHaveBeenCalled();
	});
	test("built-ins default on, can all be disabled, and custom classes remain deduplicated", async () => {
		client = new VirelloClient({ intents: [] });
		expect(client.extensions).toHaveLength(5);
		expect(client.modules.has("tasks")).toBe(true);
		expect(container.tasks.storage).toBe("memory");
		expect(container.i18n.languagesLoaded).toBe(false);
		await client.destroy();
		const calls: string[] = [];
		class Custom extends Extension {
			static override setup() {
				calls.push("custom");
			}
		}
		client = new VirelloClient({
			intents: [],
			extensions: {
				localisation: false,
				scheduledtasks: false,
				patternCommands: false,
				subcommands: false,
				services: false,
				custom: [Custom, Custom],
			},
		});
		expect(client.extensions).toEqual([Custom]);
		expect(calls).toEqual(["custom"]);
		expect(client.modules.size).toBe(5);
		expect(container.tasks).toBeUndefined();
		expect(container.i18n).toBeUndefined();
		await client.load();
		expect(
			[...client.modules.require("listeners").keys()].some((name) =>
				name.includes("Plugin"),
			),
		).toBe(false);
	});
	test("only one active client, including while asynchronous cleanup is in progress", async () => {
		client = new VirelloClient({ intents: [] });
		expect(() => new VirelloClient({ intents: [] })).toThrow("Only one");
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		client.addDisposer(() => gate);
		const closed = client.destroy();
		expect(() => new VirelloClient({ intents: [] })).toThrow("Only one");
		release();
		await closed;
		client = new VirelloClient({ intents: [] });
	});
	test("a failed custom setup releases resources and removes its registrations", async () => {
		const { instance, logs } = logger();
		const cleaned: string[] = [];
		class Broken extends Extension {
			static override setup(owner: VirelloClient) {
				owner.modules.register(
					new ModuleStore(Module, { name: "reviewOwned" }),
				);
				owner.addDisposer(async () => {
					await Bun.sleep(1);
					cleaned.push("disposed");
				});
				throw new Error("setup failed");
			}
		}
		client = new VirelloClient({
			intents: [],
			logger: instance,
			extensions: { custom: [Broken] },
		});
		await client.load();
		expect(cleaned).toEqual(["disposed"]);
		expect(client.modules.has("reviewOwned")).toBe(false);
		expect(client.modules.require("arguments").has("string")).toBe(true);
		expect(logs.error[0]).toBeInstanceOf(Error);
		expect((logs.error[0] as Error).cause).toBeInstanceOf(Error);
	});
	test("recoverable login hooks are isolated while Discord authentication failures close resources", async () => {
		const { instance, logs } = logger();
		const cleaned: string[] = [];
		class Broken extends Extension {
			static override setup(owner: VirelloClient) {
				owner.addDisposer(() => cleaned.push("feature"));
			}
			static override beforeLogin() {
				throw new Error("optional hook failed");
			}
		}
		const login = spyOn(DiscordRuntime.prototype, "login").mockResolvedValue(
			"mock-token",
		);
		client = new VirelloClient({
			intents: [],
			logger: instance,
			extensions: { custom: [Broken] },
		});
		await client.login("mock-token");
		expect(cleaned).toEqual(["feature"]);
		expect(logs.error).toHaveLength(1);
		await client.destroy();
		login.mockRejectedValue(new Error("authentication failed"));
		client = new VirelloClient({ intents: [], logger: instance });
		client.addDisposer(() => cleaned.push("client"));
		await expect(client.login("invalid")).rejects.toThrow(
			"authentication failed",
		);
		expect(cleaned).toEqual(["feature", "client"]);
		expect(container.client).toBeUndefined();
	});
});

test("eligible discovery, class metadata, duplicates and bad exports are deterministic", async () => {
	const root = mkdtempSync(join(import.meta.dir, "review-fixture-"));
	dirs.push(root);
	mkdirSync(join(root, "folder"));
	const moduleSource = (name: string, description: string) =>
		`import { Command } from 'virello'; export default class extends Command { static options = {name:'${name}',description:'${description}',fullCategory:['metadata']}; }`;
	writeFileSync(join(root, "folder/a.ts"), moduleSource("winner", "first"));
	writeFileSync(join(root, "folder/b.ts"), moduleSource("winner", "second"));
	for (const name of [
		"_hidden.ts",
		"-hidden.ts",
		".hidden.ts",
		"declaration.d.ts",
		"not.mts",
		"not.js",
		"not.tsx",
	])
		writeFileSync(
			join(root, "folder", name),
			'throw new Error("ineligible file imported")',
		);
	writeFileSync(join(root, "folder/c.ts"), 'throw new Error("bad import")');
	writeFileSync(
		join(root, "folder/d.ts"),
		`import { Command } from 'virello'; export class A extends Command { constructor(c) { super(c); throw new Error('bad constructor'); } } export class Z extends Command { static options={name:'survivor'}; }`,
	);
	writeFileSync(
		join(root, "folder/e.ts"),
		`import { Command, ApplyOptions } from 'virello'; @ApplyOptions({name:'decorated',fullCategory:['explicit']}) export default class extends Command {}`,
	);
	const { instance, logs } = logger();
	client = new VirelloClient({
		intents: [],
		logger: instance,
		root,
		modules: { commands: ["folder/**/*", "folder/*.ts"] },
	});
	await client.load();
	const store = client.modules.require("commands");
	const winner = store.get("winner")!;
	expect([...store.keys()]).toEqual(["winner", "survivor", "decorated"]);
	expect(winner.description).toBe("first");
	expect(winner.fullCategory).toEqual(["metadata"]);
	expect(store.get("decorated")!.fullCategory).toEqual(["explicit"]);
	expect(logs.alert).toHaveLength(1);
	expect(String(logs.alert[0])).toContain("winner");
	expect(logs.error).toHaveLength(2);
	await client.load();
	expect(logs.alert).toHaveLength(1);
});

test("failed activation cleans its resources and permits later duplicates and unrelated modules", async () => {
	const { instance, logs } = logger();
	client = new VirelloClient({ intents: [], logger: instance });
	let cleanup = 0;
	class Bad extends Command {
		static override options = { name: "same" };
		override onLoad() {
			throw new Error("bad activation");
		}
		override onUnload() {
			cleanup++;
		}
	}
	@ApplyOptions<Command.Options>({ name: "same" })
	class Good extends Command {}
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
	expect(client.modules.require("commands").get("same")).toBeInstanceOf(Good);
	expect(cleanup).toBe(1);
	expect(logs.error).toHaveLength(1);
});

test("failed module cleanup is fatal and releases the other client resources", async () => {
	const { instance } = logger();
	client = new VirelloClient({ intents: [], logger: instance });
	let disposed = false;
	client.addDisposer(() => {
		disposed = true;
	});
	class Broken extends Command {
		override onLoad() {
			throw new Error("activation");
		}
		override onUnload() {
			throw new Error("cannot clean up");
		}
	}
	await client.modules.addModule({
		store: "commands",
		name: "broken",
		module: Broken,
	});
	await expect(client.load()).rejects.toThrow("activation and cleanup");
	expect(disposed).toBe(true);
	expect(container.client).toBeUndefined();
	client = new VirelloClient({ intents: [], logger: instance });
});

test("invalid repeated task metadata is skipped without disabling healthy tasks", async () => {
	const { instance, logs } = logger();
	client = new VirelloClient({ intents: [], logger: instance });
	class Invalid extends Task {
		static override options = { interval: -1 };
		override run() {}
	}
	class Healthy extends Task {
		static override options = { interval: 1000 };
		override run() {}
	}
	await client.modules.addModule({
		store: "tasks",
		name: "invalid",
		module: Invalid,
	});
	await client.modules.addModule({
		store: "tasks",
		name: "healthy",
		module: Healthy,
	});
	await client.load();
	expect([...client.modules.require("tasks").keys()]).toEqual(["healthy"]);
	expect(logs.error).toHaveLength(1);
	await container.tasks.createRepeated();
	expect(await container.tasks.listRepeated()).toHaveLength(1);
});
