import { afterEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
	Command,
	Extension,
	VirelloClient,
	Listener,
	Module,
	ModuleLoader,
	type ModulePaths,
	ModuleStore,
} from "virello";

declare module "virello" {
	interface ModuleStores {
		probes: ModuleStore<Module, "probes">;
	}
}
const directories: string[] = [];
let client: VirelloClient | undefined;
function fixture() {
	const path = mkdtempSync(join(import.meta.dir, "glob-fixture-"));
	directories.push(path);
	return path;
}
function put(base: string, path: string, source: string) {
	const file = join(base, path);
	mkdirSync(join(file, ".."), { recursive: true });
	writeFileSync(file, source);
	return file;
}
const command = (name?: string, description = "loaded") =>
	'import { Command } from "virello"; export default class extends Command { constructor(context) { super(context, ' +
	JSON.stringify({ ...(name ? { name } : {}), description }) +
	"); } }";
afterEach(async () => {
	await client?.destroy();
	client = undefined;
	for (const path of directories.splice(0)) {
		if (!resolve(path).startsWith(resolve(import.meta.dir) + sep))
			throw new Error("Unsafe fixture cleanup");
		rmSync(path, { recursive: true, force: true });
	}
});

describe("explicit Bun module globs", () => {
	test("no implicit folders, and load is idempotent", async () => {
		const root = fixture();
		put(root, "commands/broken.ts", "this is not typescript");
		client = new VirelloClient({ intents: [], root });
		await client.load();
		const argument = client.modules.require("arguments").get("string");
		await Promise.all([client.load(), client.load()]);
		expect(client.modules.require("commands").size).toBe(0);
		expect(client.modules.require("arguments").get("string")).toBe(argument);
	});
	test("file URL roots, arbitrary directories, braces, exclusions and declarations", async () => {
		const root = fixture();
		put(root, "odd place/nested/alpha.ts", command());
		put(root, "odd place/_beta.mts", command());
		put(root, "odd place/.hidden.ts", command());
		put(root, "odd place/skip.ts", 'throw new Error("excluded")');
		put(root, "odd place/types.d.ts", "export interface OnlyTypes {}");
		client = new VirelloClient({
			intents: [],
			root: pathToFileURL(root),
			modules: { commands: ["odd place/**/*.{ts,mts}", "!**/skip.ts"] },
		});
		await client.load();
		expect([...client.modules.require("commands").keys()]).toEqual(["alpha"]);
	});
	test("relative roots and absolute platform paths work", async () => {
		const root = fixture();
		const file = put(root, "wherever/a.ts", command());
		client = new VirelloClient({
			intents: [],
			root: join(root, "..", root.split(sep).at(-1)!),
			modules: { commands: file },
		});
		await client.load();
		expect(client.modules.require("commands").get("a")).toBeInstanceOf(Command);
	});
	test("native separators and overlapping includes import once; export aliases do not duplicate instances", async () => {
		const root = fixture();
		const key = "__virelloImportCount";
		Reflect.set(globalThis, key, 0);
		put(
			root,
			"unusual/a.ts",
			`import { Command } from "virello"; globalThis.${key}++; class A extends Command {} export { A, A as default };`,
		);
		client = new VirelloClient({
			intents: [],
			root,
			modules: {
				commands: [
					join("unusual", "*.ts"),
					"**/*.ts",
					join(root, "unusual", "a.ts"),
				],
			},
		});
		await client.load();
		expect(client.modules.require("commands").size).toBe(1);
		expect(Reflect.get(globalThis, key)).toBe(1);
		Reflect.deleteProperty(globalThis, key);
	});
	test("one file can serve several module kinds without repeated evaluation", async () => {
		const root = fixture();
		const key = "__virelloKinds";
		Reflect.set(globalThis, key, 0);
		put(
			root,
			"mixed.ts",
			'import { Command, Listener } from "virello"; globalThis.' +
				key +
				'++; export class A extends Command {} export class B extends Listener { constructor(c) { super(c,{name:"event",event:"test"}) } run() {} }',
		);
		client = new VirelloClient({
			intents: [],
			root,
			modules: { commands: "*.ts", listeners: "*.ts" },
		});
		await client.load();
		expect(Reflect.get(globalThis, key)).toBe(1);
		expect(client.modules.require("listeners").has("event")).toBe(true);
		const first = client.modules.require("commands").get("mixed");
		await Promise.all([client.load(), client.modules.load()]);
		expect(Reflect.get(globalThis, key)).toBe(1);
		expect(client.modules.require("commands").get("mixed")).toBe(first);
		expect(client.modules.require("listeners").has("event")).toBe(true);
		Reflect.deleteProperty(globalThis, key);
	});
	test("valid empty matches are allowed", async () => {
		client = new VirelloClient({
			intents: [],
			root: fixture(),
			modules: { commands: "missing/**/*.ts" },
		});
		await client.load();
		expect(client.modules.require("commands").size).toBe(0);
	});
	for (const pattern of ["", "[", "{a,b", "a}", "!**/*.ts", [""], [], 42, null])
		test(`invalid pattern fails clearly: ${JSON.stringify(pattern)}`, () => {
			expect(
				() =>
					new VirelloClient({
						intents: [],
						modules: { commands: pattern } as ModulePaths,
					}),
			).toThrow("Invalid module patterns");
		});
	test("unregistered kinds require an extension", () => {
		expect(
			() =>
				new VirelloClient({
					intents: [],
					extensions: { services: false },
					modules: { services: "*.ts" },
				}),
		).toThrow("Enable its extension");
	});
	test("duplicate module names keep the first accepted candidate", async () => {
		const root = fixture();
		put(root, "a.ts", command("same"));
		put(root, "b.ts", command("same"));
		client = new VirelloClient({
			intents: [],
			root,
			modules: { commands: "*.ts" },
		});
		await client.load();
		expect(client.modules.require("commands").size).toBe(1);
		expect(client.modules.require("arguments").size).toBeGreaterThan(0);
	});
	for (const source of [
		"export const value = 1;",
		"export const = ;",
		'throw new Error("boom");',
	])
		test(`startup skips invalid module source: ${source}`, async () => {
			const root = fixture();
			const path = put(root, "a.ts", source);
			client = new VirelloClient({
				intents: [],
				root,
				modules: { commands: "*.ts" },
			});
			const startup = client.load();
			expect(client.modules.load()).toBe(startup);
			await startup;
			expect(client.modules.require("commands").size).toBe(0);
			writeFileSync(path, command("fixed"));
			expect(client.load()).toBe(startup);
			await client.load();
			expect(client.modules.require("commands").size).toBe(0);
		});
	test("edits, added files and deleted files do not change the startup snapshot", async () => {
		const root = fixture();
		const firstPath = put(root, "a.ts", command("one", "initial"));
		const secondPath = put(root, "b.ts", command("two"));
		client = new VirelloClient({
			intents: [],
			root,
			modules: { commands: "*.ts" },
		});
		const startup = client.load();
		expect(client.load()).toBe(startup);
		await startup;
		const store = client.modules.require("commands");
		const first = store.get("one");
		const second = store.get("two");
		writeFileSync(firstPath, command("changed"));
		put(root, "new.ts", command("new"));
		unlinkSync(secondPath);
		await Promise.all([
			client.load(),
			client.modules.load(),
			store.initialize([]),
		]);
		expect([...store.keys()]).toEqual(["one", "two"]);
		expect(store.get("one")).toBe(first);
		expect(store.get("two")).toBe(second);
		expect(first?.description).toBe("initial");
		expect(() =>
			client!.modules.configure({ commands: "new.ts" }, root),
		).toThrow("Restart the process");
		await first!.unload();
		await client.load();
		expect(store.has("one")).toBe(false);
	});
});

describe("module lifecycle and extension contracts", () => {
	test("async loader and module hooks run in order; failed activation preserves unrelated instances", async () => {
		client = new VirelloClient({ intents: [] });
		const calls: string[] = [];
		class Hooks extends ModuleLoader<Module> {
			override async onLoad() {
				await Bun.sleep(1);
				calls.push("loader load");
			}
			override async onUnload() {
				await Bun.sleep(1);
				calls.push("loader unload");
			}
		}
		const store = new ModuleStore(Module, {
			name: "probes",
			strategy: new Hooks(),
		});
		client.modules.register(store);
		class Good extends Module {
			override async onLoad() {
				await Bun.sleep(1);
				calls.push("module load");
			}
			override async onUnload() {
				await Bun.sleep(1);
				calls.push("module unload");
			}
		}
		await store.addModule({ name: "one", module: Good });
		await client.load();
		const original = store.get("one")!;
		expect(calls).toEqual(["loader load", "module load"]);
		calls.length = 0;
		class Bad extends Module {
			override onLoad() {
				throw new Error("failed activation");
			}
		}
		const bad = new Bad({
			name: "bad",
			store,
			root: "::virtual::",
			path: "::virtual::",
		});
		await expect(store.insert(bad)).rejects.toThrow("activate module");
		expect(store.get("one")).toBe(original);
		expect(calls).toEqual(["loader load", "loader unload"]);
	});
	test("all cleanup runs, even when a loader hook fails", async () => {
		const calls: string[] = [];
		class Hooks extends ModuleLoader<Module> {
			override async onUnload() {
				calls.push("loader");
				throw new Error("failure");
			}
		}
		const store = new ModuleStore(Module, {
			name: "probes",
			strategy: new Hooks(),
		});
		class Entry extends Module {
			override onUnload() {
				calls.push("module");
			}
		}
		await store.addModule({ name: "one", module: Entry });
		await store.addModule({ name: "two", module: Entry });
		await store.initialize(await store.prepare([], process.cwd()));
		await expect(store.unloadAll()).rejects.toThrow("every module");
		expect(calls.filter((call) => call === "module")).toHaveLength(2);
		expect(store.size).toBe(0);
	});
	test("a once listener is removed when unloaded before firing", async () => {
		const emitter = new EventEmitter();
		const maximum = emitter.getMaxListeners();
		client = new VirelloClient({ intents: [] });
		class Once extends Listener {
			constructor(context: Listener.Context) {
				super(context, { emitter, event: "one", once: true });
			}
			run() {}
		}
		await client.modules.addModule({
			store: "listeners",
			name: "once-test",
			module: Once,
		});
		await client.load();
		expect(emitter.listenerCount("one")).toBe(1);
		await client.modules.require("listeners").get("once-test")!.unload();
		expect(emitter.listenerCount("one")).toBe(0);
		expect(emitter.getMaxListeners()).toBe(maximum);
	});
	test("extensions keep inherited hooks and run once per class in declared order", () => {
		const calls: string[] = [];
		class First extends Extension {
			static override setup() {
				calls.push(this.name);
			}
		}
		class Second extends First {}
		client = new VirelloClient({
			intents: [],
			extensions: { custom: [First, Second, First] },
		});
		expect(calls).toEqual(["First", "Second"]);
	});
	test("closed clients reject load and reuse one cleanup promise", async () => {
		client = new VirelloClient({ intents: [] });
		await client.load();
		const first = client.destroy();
		expect(client.destroy()).toBe(first);
		await first;
		await expect(client.load()).rejects.toThrow("closed");
	});
});

test("module events reflect successful registration and unloading", async () => {
	client = new VirelloClient({ intents: [] });
	const events: string[] = [];
	client.on("moduleLoaded", (store, module) => {
		if (store.name === "commands") events.push(`load:${module.name}`);
	});
	client.on("moduleUnloaded", (store, module) => {
		if (store.name === "commands") events.push(`unload:${module.name}`);
	});
	class Entry extends Command {}
	await client.modules.addModule({
		store: "commands",
		name: "entry",
		module: Entry,
	});
	await client.load();
	await client.modules.require("commands").get("entry")!.unload();
	expect(events).toEqual(["load:entry", "unload:entry"]);
});
