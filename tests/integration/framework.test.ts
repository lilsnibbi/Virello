import { afterEach, describe, expect, test } from "bun:test";
import { container, Task } from "virello";

declare module "virello" {
	interface Tasks {
		integrationTick: never;
		integrationEcho: { message: string };
	}
}

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
	Command,
	Extension,
	VirelloClient,
	LocaleManager,
	ModuleLoader,
	type,
} from "virello";

const directories: string[] = [];
let client: VirelloClient | undefined;
function fixture(): string {
	const directory = mkdtempSync(join(import.meta.dir, "fixture-"));
	directories.push(directory);
	return directory;
}
afterEach(async () => {
	await client?.destroy();
	client = undefined;
	for (const directory of directories.splice(0)) {
		if (!resolve(directory).startsWith(resolve(import.meta.dir) + sep))
			throw new Error("Unexpected fixture path");
		rmSync(directory, { recursive: true, force: true });
	}
});

describe("Virello integration", () => {
	test("package imports do not enable external services", () => {
		client = new VirelloClient({ intents: [] });
		expect(client.modules.size).toBe(8);
		expect("server" in client).toBe(false);
		expect(container.tasks.storage).toBe("memory");
		expect(client.extensions).toHaveLength(5);
	});

	test("ArkType rejects invalid framework options", () => {
		expect(
			() => new VirelloClient({ intents: [], defaultCooldown: { delay: -1 } }),
		).toThrow();
		expect(
			() => new VirelloClient({ intents: [], defaultPrefix: 42 } as never),
		).toThrow();
		const payload = type({ count: "number.integer > 0" });
		expect(payload.assert({ count: 2 })).toEqual({ count: 2 });
		expect(payload({ count: 0 })).toBeInstanceOf(type.errors);
	});

	test("built-in pieces load on each client lifecycle", async () => {
		for (let run = 0; run < 2; run++) {
			client = new VirelloClient({ intents: [] });
			await client.load();
			expect(client.modules.require("arguments").has("string")).toBe(true);
			expect(client.modules.require("arguments").has("integer")).toBe(true);
			expect(client.modules.require("preconditions").has("Enabled")).toBe(true);
			expect(client.modules.require("listeners").size).toBeGreaterThan(5);
			await client.destroy();
			client = undefined;
		}
	});

	test("raw TypeScript modules keep their imported code until process restart", async () => {
		const base = fixture();
		const commandDirectory = join(base, "commands");
		mkdirSync(commandDirectory);
		const path = join(commandDirectory, "ping.ts");
		const source = (description: string) =>
			'import { Command } from "virello"; export default class Ping extends Command { constructor(context: Command.Context) { super(context, { description: ' +
			JSON.stringify(description) +
			" }); } }";
		writeFileSync(path, source("first"));
		client = new VirelloClient({
			intents: [],
			root: base,
			modules: { commands: "commands/*.ts" },
		});
		await client.load();
		const first = client.modules.require("commands").get("ping");
		expect(first).toBeInstanceOf(Command);
		expect(first?.description).toBe("first");
		writeFileSync(path, source("second"));
		await client.load();
		expect(client.modules.require("commands").get("ping")).toBe(first);
		await client.destroy();
		client = new VirelloClient({
			intents: [],
			root: base,
			modules: { commands: "commands/*.ts" },
		});
		await client.load();
		expect(client.modules.require("commands").get("ping")?.description).toBe(
			"first",
		);
		const loader = new ModuleLoader();
		expect(loader.filter("module.d.ts")).toBeNull();
		expect(loader.filter("module.d.mts")).toBeNull();
		expect(loader.filter("_private.ts")).toBeNull();
		expect(loader.filter("module.cjs")).toBeNull();
	});

	test("plugins are explicit, ordered, and deduplicated", async () => {
		const calls: string[] = [];
		class Feature extends Extension {
			static override setup() {
				calls.push("before");
			}
		}
		client = new VirelloClient({
			intents: [],
			extensions: { custom: [Feature, Feature] },
		});
		await client.load();
		expect(calls).toEqual(["before"]);
		expect(client.modules.has("patterns")).toBe(true);
		expect(client.modules.has("services")).toBe(true);
		expect(
			client.modules.require("preconditions").has("SubcommandCooldown"),
		).toBe(true);
	});

	test("localization forwards interpolation and fallback options", async () => {
		const base = fixture();
		const locale = join(base, "en-US");
		mkdirSync(locale);
		writeFileSync(
			join(locale, "default.json"),
			JSON.stringify({ greeting: "Hello {{name}}" }),
		);
		client = new VirelloClient({
			intents: [],
			extensions: { localisation: { defaultLanguageDirectory: base } },
		});
		const handler = new LocaleManager({ defaultLanguageDirectory: base });
		await handler.init();
		expect(handler.format("en-US", "greeting", { name: "Virello" })).toBe(
			"Hello Virello",
		);
		expect(
			handler.format("en-US", "missing", { defaultValue: "Fallback" }),
		).toBe("Fallback");
		const translator = handler.getT("en-US");
		writeFileSync(
			join(locale, "default.json"),
			JSON.stringify({ greeting: "Changed {{name}}" }),
		);
		const initialization = handler.init();
		expect(handler.init()).toBe(initialization);
		await initialization;
		expect(handler.getT("en-US")).toBe(translator);
		expect(handler.format("en-US", "greeting", { name: "Virello" })).toBe(
			"Hello Virello",
		);
	});

	test("task pieces can load without opening Redis connections", async () => {
		client = new VirelloClient({
			intents: [],
			extensions: { scheduledtasks: { redis_url: "redis://127.0.0.1:1" } },
		});
		await client.load();
		expect(client.modules.has("tasks")).toBe(true);
		await client.destroy();
		client = undefined;
	});

	test("scheduled tasks run by name or payload without Redis", async () => {
		client = new VirelloClient({
			intents: [],
			extensions: { scheduledtasks: { redis_url: "redis://127.0.0.1:1" } },
		});
		const calls: string[] = [];
		class Tick extends Task<"integrationTick"> {
			constructor(context: Task.Context) {
				super(context, {});
			}
			run() {
				calls.push("tick");
			}
		}
		class Echo extends Task<"integrationEcho"> {
			constructor(context: Task.Context) {
				super(context, {});
			}
			run(payload: { message: string }) {
				calls.push(payload.message);
			}
		}
		await client.modules.addModule({
			store: "tasks",
			name: "integrationTick",
			module: Tick,
		});
		await client.modules.addModule({
			store: "tasks",
			name: "integrationEcho",
			module: Echo,
		});
		await client.load();
		expect(await container.tasks.run("integrationTick")).toBeNumber();
		expect(
			await container.tasks.run({
				name: "integrationEcho",
				payload: { message: "hello" },
			}),
		).toBeNumber();
		expect(calls).toEqual(["tick", "hello"]);
	});

	test("destroy completes cleanup even when a disposer fails", async () => {
		client = new VirelloClient({ intents: [] });
		await client.load();
		const calls: string[] = [];
		client.addDisposer(() => {
			calls.push("failed");
			throw new Error("cleanup failure");
		});
		client.addDisposer(() => {
			calls.push("closed");
		});
		await expect(client.destroy()).rejects.toBeInstanceOf(AggregateError);
		expect(calls).toEqual(["closed", "failed"]);
		expect(
			[...client.modules.values()].every((store) => store.size === 0),
		).toBe(true);
		client = undefined;
	});

	test("scheduling defaults to memory", () => {
		client = new VirelloClient({ intents: [] });
		expect(container.tasks.storage).toBe("memory");
	});
});
