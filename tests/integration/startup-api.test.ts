import { afterEach, expect, test } from "bun:test";
import { expectTypeOf } from "expect-type";
import * as Virello from "virello";
import {
	Command,
	type InternationalizationOptions,
	VirelloClient,
	type VirelloClientOptions,
	LocaleManager,
	Module,
	ModuleRegistry,
	ModuleStore,
} from "virello";

let client: VirelloClient | undefined;
afterEach(async () => {
	await client?.destroy();
	client = undefined;
});

test("the public API has startup and cleanup, without reload entry points", () => {
	expectTypeOf<VirelloClient>().not.toHaveProperty("reload");
	expectTypeOf<Module>().not.toHaveProperty("reload");
	expectTypeOf<Command>().not.toHaveProperty("reload");
	expectTypeOf<ModuleRegistry>().not.toHaveProperty("refresh");
	expectTypeOf<ModuleRegistry>().not.toHaveProperty("watchPaths");
	expectTypeOf<ModuleStore<Module>>().not.toHaveProperty("load");
	expectTypeOf<ModuleStore<Module>>().not.toHaveProperty("loadAll");
	expectTypeOf<ModuleStore<Module>>().not.toHaveProperty("replaceAll");
	expectTypeOf<ModuleStore<Module>>().not.toHaveProperty("replaceFile");
	expectTypeOf<LocaleManager>().not.toHaveProperty("reloadResources");
	expectTypeOf<VirelloClientOptions>().not.toHaveProperty("hmr");
	expectTypeOf<InternationalizationOptions>().not.toHaveProperty("hmr");
	expect("WatchExtension" in Virello).toBe(false);
	expect("watchModules" in Virello).toBe(false);
	expect("reload" in VirelloClient.prototype).toBe(false);
	expect("reload" in Command.prototype).toBe(false);
	expect("reloadResources" in LocaleManager.prototype).toBe(false);
});

test("old watcher options fail with migration guidance", () => {
	expect(() => new VirelloClient({ intents: [], hmr: {} } as never)).toThrow(
		'no longer supports "hmr"',
	);
	expect(() => new LocaleManager({ hmr: { enabled: true } } as never)).toThrow(
		"Restart the process",
	);
});

test("shutdown waits for startup activation and still runs module cleanup", async () => {
	client = new VirelloClient({ intents: [] });
	let release!: () => void;
	let started!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const entered = new Promise<void>((resolve) => {
		started = resolve;
	});
	const calls: string[] = [];
	class Slow extends Command {
		override async onLoad() {
			started();
			await gate;
			calls.push("loaded");
		}
		override onUnload() {
			calls.push("unloaded");
		}
	}
	await client.modules.addModule({
		store: "commands",
		name: "slow",
		module: Slow,
	});
	const startup = client.load();
	await entered;
	const closing = client.destroy();
	expect(client.destroy()).toBe(closing);
	expect(calls).toEqual([]);
	release();
	await Promise.all([startup, closing]);
	expect(calls).toEqual(["loaded", "unloaded"]);
	expect(client.modules.require("commands").size).toBe(0);
	await expect(client.load()).rejects.toThrow("closed");
});

test("failed activation shares one startup result and cleans up the partial module", async () => {
	client = new VirelloClient({ intents: [] });
	let loads = 0,
		unloads = 0;
	class Broken extends Command {
		override onLoad() {
			loads++;
			throw new Error("startup failure");
		}
		override onUnload() {
			unloads++;
		}
	}
	await client.modules.addModule({
		store: "commands",
		name: "broken",
		module: Broken,
	});
	const startup = client.load();
	await startup;
	expect(client.load()).toBe(startup);
	await client.modules.load();
	expect(loads).toBe(1);
	expect(unloads).toBe(1);
	expect(client.modules.require("commands").size).toBe(0);
});
