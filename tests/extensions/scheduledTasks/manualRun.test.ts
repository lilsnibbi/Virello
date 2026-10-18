import { afterEach, expect, test } from "bun:test";
import { container, VirelloClient, Task } from "virello";

declare module "virello" {
	interface Tasks {
		manualDrain: never;
	}
}

let client: VirelloClient | undefined;
afterEach(async () => {
	await client?.destroy();
	client = undefined;
});

test("client shutdown drains manually started tasks before unloading their resources", async () => {
	client = new VirelloClient({
		intents: [],
		logger: { debug() {}, notif() {}, alert() {}, error() {} },
	});
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const calls: string[] = [];
	class Manual extends Task<"manualDrain"> {
		override async run() {
			entered.resolve();
			await release.promise;
			calls.push("finished");
		}
		override onUnload() {
			calls.push("unloaded");
		}
	}
	await client.modules.addModule({
		store: "tasks",
		name: "manualDrain",
		module: Manual,
	});
	await client.load();
	const pending = container.tasks.run("manualDrain");
	await entered.promise;
	const closing = client.destroy();
	try {
		await Bun.sleep(10);
		expect(calls).toEqual([]);
	} finally {
		release.resolve();
		await Promise.all([pending, closing]);
	}
	expect(calls).toEqual(["finished", "unloaded"]);
});
