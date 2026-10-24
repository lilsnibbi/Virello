import { afterEach, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
	ApplicationCommandRegistries,
	Command,
	VirelloClient,
	Listener,
} from "virello";

let client: VirelloClient | undefined;
afterEach(async () => {
	await client?.destroy();
	client = undefined;
});

function createClient() {
	return (client = new VirelloClient({
		intents: [],
		logger: { debug() {}, notif() {}, alert() {}, error() {} },
	}));
}

test("concurrent registrations of one name activate only the first listener and release its resources", async () => {
	const owner = createClient();
	await owner.load();
	const emitter = new EventEmitter();
	const maximum = emitter.getMaxListeners();
	let loads = 0;
	class Entry extends Listener {
		constructor(context: Listener.Context) {
			super(context, { emitter, event: "probe" });
		}
		override async onLoad() {
			loads++;
			await Bun.sleep(5);
		}
		run() {}
	}
	const store = owner.modules.require("listeners");
	await Promise.all(
		Array.from({ length: 3 }, () =>
			store.addModule({ name: "concurrent", module: Entry }),
		),
	);
	expect(loads).toBe(1);
	expect(emitter.listenerCount("probe")).toBe(1);
	await owner.destroy();
	expect(emitter.listenerCount("probe")).toBe(0);
	expect(emitter.getMaxListeners()).toBe(maximum);
});

test("a failed concurrent activation cleans up before the next candidate starts", async () => {
	const owner = createClient();
	await owner.load();
	const calls: string[] = [];
	class Broken extends Command {
		override async onLoad() {
			calls.push("broken load");
			await Bun.sleep(5);
			throw new Error("activation failed");
		}
		override async onUnload() {
			await Bun.sleep(5);
			calls.push("broken unload");
		}
	}
	class Healthy extends Command {
		override onLoad() {
			calls.push("healthy load");
		}
	}
	const store = owner.modules.require("commands");
	const results = await Promise.allSettled([
		store.addModule({ name: "concurrent", module: Broken }),
		store.addModule({ name: "concurrent", module: Healthy }),
	]);
	expect(results.map((result) => result.status)).toEqual([
		"rejected",
		"fulfilled",
	]);
	expect(calls).toEqual(["broken load", "broken unload", "healthy load"]);
	expect(store.get("concurrent")).toBeInstanceOf(Healthy);
	expect(ApplicationCommandRegistries.acquire("concurrent")).toBe(
		store.get("concurrent")!.applicationCommandRegistry,
	);
});

test("alias stores return the accepted module when a duplicate insertion is ignored", async () => {
	const owner = createClient();
	await owner.modules.addModule({
		store: "commands",
		name: "duplicate",
		module: Command,
	});
	await owner.load();
	const store = owner.modules.require("commands");
	const original = store.get("duplicate")!;
	const duplicate = new Command({
		name: original.name,
		store,
		root: "::virtual::",
		path: "::virtual::",
	});
	expect(await store.insert(duplicate)).toBe(original);
});

test("shutdown waits for a runtime registration to finish before unloading it", async () => {
	const owner = createClient();
	await owner.load();
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	let cleanups = 0;
	class Entry extends Command {
		override async onLoad() {
			entered.resolve();
			await release.promise;
		}
		override onUnload() {
			cleanups++;
		}
	}
	const store = owner.modules.require("commands");
	const adding = store.addModule({ name: "during-close", module: Entry });
	await entered.promise;
	let closed = false;
	const closing = owner.destroy().then(() => {
		closed = true;
	});
	try {
		await Bun.sleep(5);
		expect(closed).toBe(false);
	} finally {
		release.resolve();
		await Promise.all([adding, closing]);
	}
	expect(cleanups).toBe(1);
	expect(store.size).toBe(0);
});

test("overlapping unloads share cleanup and emit the unload event once", async () => {
	const owner = createClient();
	let cleanups = 0;
	let events = 0;
	class Entry extends Command {
		override async onUnload() {
			cleanups++;
			await Bun.sleep(5);
		}
	}
	await owner.modules.addModule({
		store: "commands",
		name: "concurrent",
		module: Entry,
	});
	await owner.load();
	owner.on("moduleUnloaded", (_store, module) => {
		if (module.name === "concurrent") events++;
	});
	const store = owner.modules.require("commands");
	const module = store.get("concurrent")!;
	await Promise.all([module.unload(), store.unloadAll(), module.unload()]);
	expect(cleanups).toBe(1);
	expect(events).toBe(1);
	expect(store.has("concurrent")).toBe(false);
});

test("disabled activation with failing cleanup does not execute cleanup twice", async () => {
	const owner = createClient();
	await owner.load();
	let cleanups = 0;
	class Entry extends Command {
		override onLoad() {
			this.enabled = false;
		}
		override onUnload() {
			cleanups++;
			throw new Error("cleanup failed");
		}
	}
	await expect(
		owner.modules
			.require("commands")
			.addModule({ name: "disabled", module: Entry }),
	).rejects.toThrow();
	expect(cleanups).toBe(1);
});
