import { afterEach, expect, test } from "bun:test";
import { Command, VirelloClient, Service } from "virello";

let client: VirelloClient | undefined;
afterEach(async () => {
	await client?.destroy();
	client = undefined;
});

test("a module can await registration of another module in its initializing store", async () => {
	client = new VirelloClient({
		intents: [],
		logger: { debug() {}, notif() {}, alert() {}, error() {} },
	});
	const owner = client;
	const calls: string[] = [];
	class Child extends Command {
		override onLoad() {
			calls.push("child loaded");
		}
		override onUnload() {
			calls.push("child unloaded");
		}
	}
	class Parent extends Command {
		override async onLoad() {
			await owner.modules.addModule({
				store: "commands",
				name: "child",
				module: Child,
			});
			calls.push("parent loaded");
		}
	}
	await owner.modules.addModule({
		store: "commands",
		name: "parent",
		module: Parent,
	});
	await owner.load();
	expect(calls).toEqual(["child loaded", "parent loaded"]);
	expect(owner.modules.require("commands").get("child")).toBeInstanceOf(Child);
	await owner.destroy();
	expect(calls).toEqual(["child loaded", "parent loaded", "child unloaded"]);
});

test("startup hooks can register modules in a staged store that has not initialized yet", async () => {
	client = new VirelloClient({
		intents: [],
		logger: { debug() {}, notif() {}, alert() {}, error() {} },
	});
	const owner = client;
	let loaded = false;
	class Dependency extends Service {
		override onLoad() {
			loaded = true;
		}
	}
	class Parent extends Command {
		override async onLoad() {
			await owner.modules.addModule({
				store: "services",
				name: "dependency",
				module: Dependency,
			});
		}
	}
	await owner.modules.addModule({
		store: "commands",
		name: "parent",
		module: Parent,
	});
	await owner.load();
	expect(loaded).toBe(true);
	expect(owner.modules.require("services").get("dependency")).toBeInstanceOf(
		Dependency,
	);
});

for (const registerInHook of [false, true])
	test(`startup ${registerInHook ? "nested" : "explicit"} registration never waits behind its own activation`, async () => {
		client = new VirelloClient({
			intents: [],
			logger: { debug() {}, notif() {}, alert() {}, error() {} },
		});
		const owner = client;
		let outcome: string | undefined;
		class Parent extends Command {
			override async onLoad() {
				outcome = await Promise.race([
					owner.modules
						.addModule({ store: "commands", name: "parent", module: Parent })
						.then(() => "registered"),
					Bun.sleep(100).then(() => "blocked"),
				]);
			}
		}
		class Bootstrap extends Command {
			override async onLoad() {
				await owner.modules.addModule({
					store: "commands",
					name: "parent",
					module: Parent,
				});
			}
		}
		await owner.modules.addModule(
			registerInHook
				? { store: "commands", name: "bootstrap", module: Bootstrap }
				: { store: "commands", name: "parent", module: Parent },
		);
		await owner.load();
		expect(outcome).toBe("registered");
		expect(owner.modules.require("commands").get("parent")).toBeInstanceOf(
			Parent,
		);
	});

test("startup hooks preserve earlier explicit registrations that have not activated yet", async () => {
	client = new VirelloClient({
		intents: [],
		logger: { debug() {}, notif() {}, alert() {}, error() {} },
	});
	const owner = client;
	const calls: string[] = [];
	class Original extends Command {
		override onLoad() {
			calls.push("original");
		}
	}
	class Duplicate extends Command {
		override onLoad() {
			calls.push("duplicate");
		}
	}
	class Parent extends Command {
		override async onLoad() {
			await owner.modules.addModule({
				store: "commands",
				name: "child",
				module: Duplicate,
			});
			calls.push("parent");
		}
	}
	await owner.modules.addModule({
		store: "commands",
		name: "parent",
		module: Parent,
	});
	await owner.modules.addModule({
		store: "commands",
		name: "child",
		module: Original,
	});
	await owner.load();
	expect(calls).toEqual(["parent", "original"]);
	expect(owner.modules.require("commands").get("child")).toBeInstanceOf(
		Original,
	);
});

for (const duplicateName of ["entry", "another-entry"]) {
	test(`startup metadata names do not deadlock registration through ${duplicateName}`, async () => {
		client = new VirelloClient({
			intents: [],
			logger: { debug() {}, notif() {}, alert() {}, error() {} },
		});
		const owner = client;
		let outcome: string | undefined;
		class Parent extends Command {
			static override options = { name: "actual" };
			override async onLoad() {
				outcome = await Promise.race([
					owner.modules
						.addModule({
							store: "commands",
							name: duplicateName,
							module: Parent,
						})
						.then(() => "registered"),
					Bun.sleep(100).then(() => "blocked"),
				]);
			}
		}
		class Bootstrap extends Command {
			override async onLoad() {
				await owner.modules.addModule({
					store: "commands",
					name: "entry",
					module: Parent,
				});
			}
		}
		await owner.modules.addModule({
			store: "commands",
			name: "bootstrap",
			module: Bootstrap,
		});
		await owner.load();
		expect(outcome).toBe("registered");
		expect(owner.modules.require("commands").get("actual")).toBeInstanceOf(
			Parent,
		);
	});
}

test("startup metadata names preserve staged precedence across different registration names", async () => {
	client = new VirelloClient({
		intents: [],
		logger: { debug() {}, notif() {}, alert() {}, error() {} },
	});
	const owner = client;
	const calls: string[] = [];
	class Original extends Command {
		static override options = { name: "actual" };
		override onLoad() {
			calls.push("original");
		}
	}
	class Duplicate extends Command {
		static override options = { name: "actual" };
		override onLoad() {
			calls.push("duplicate");
		}
	}
	class Parent extends Command {
		override async onLoad() {
			await owner.modules.addModule({
				store: "commands",
				name: "duplicate",
				module: Duplicate,
			});
			calls.push("parent");
		}
	}
	await owner.modules.addModule({
		store: "commands",
		name: "parent",
		module: Parent,
	});
	await owner.modules.addModule({
		store: "commands",
		name: "original",
		module: Original,
	});
	await owner.load();
	expect(calls).toEqual(["parent", "original"]);
	expect(owner.modules.require("commands").get("actual")).toBeInstanceOf(
		Original,
	);
});

test("startup registration aliases cannot hide a different resolved module name", async () => {
	client = new VirelloClient({
		intents: [],
		logger: { debug() {}, notif() {}, alert() {}, error() {} },
	});
	const owner = client;
	let childLoaded = false;
	class Child extends Command {
		static override options = { name: "bar" };
		override onLoad() {
			childLoaded = true;
		}
	}
	class Parent extends Command {
		static override options = { name: "foo" };
		override async onLoad() {
			await owner.modules.addModule({
				store: "commands",
				name: "foo",
				module: Child,
			});
		}
	}
	await owner.modules.addModule({
		store: "commands",
		name: "p",
		module: Parent,
	});
	await owner.load();
	expect(childLoaded).toBe(true);
	expect(owner.modules.require("commands").get("bar")).toBeInstanceOf(Child);
});
