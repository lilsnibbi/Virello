import { expect, test } from "bun:test";
import { join } from "node:path";
import * as Root from "virello";
import * as Client from "virello/client";
import * as Commands from "virello/commands";
import * as Discord from "virello/discord";
import * as Events from "virello/events";
import * as Extensions from "virello/extensions";
import * as Localisation from "virello/localisation";
import * as Modules from "virello/modules";
import * as Scheduling from "virello/scheduling";
import * as Services from "virello/services";
import * as Sharding from "virello/sharding";
import * as Time from "virello/time";
import * as Utilities from "virello/utilities";
import * as Validation from "virello/validation";
import manifest from "../../package.json";
import { CorePreconditions } from "../../src/commands/checks/core";
import { ApplicationCommandRegistries } from "../../src/commands/registration/api";
import { registries } from "../../src/commands/registration/registries";
import { container } from "../../src/core/Container";
import baseline from "../fixtures/public.json";

const categories = {
	client: Client,
	commands: Commands,
	discord: Discord,
	events: Events,
	extensions: Extensions,
	localisation: Localisation,
	modules: Modules,
	scheduling: Scheduling,
	services: Services,
	sharding: Sharding,
	time: Time,
	utilities: Utilities,
	validation: Validation,
};

test("the complete existing root API is preserved and covered by explicit category paths", () => {
	expect(Object.keys(Root).sort()).toEqual(baseline.runtime);
	expect(Object.keys(manifest.exports).sort()).toEqual(
		[
			".",
			"./engine",
			...Object.keys(categories).map((name) => `./${name}`),
		].sort(),
	);
	expect(
		[
			...new Set(
				Object.values(categories).flatMap((category) => Object.keys(category)),
			),
		].sort(),
	).toEqual(baseline.runtime);
});

test("sharding exposes supported APIs without exporting stats transport plumbing or moving ArkType to peers", () => {
	expect(Object.keys(Sharding).sort()).toEqual([
		"ShardCoordinator",
		"ShardError",
		"ShardManager",
	]);
	for (const name of [
		"statsRequest",
		"statsMap",
		"statsSnapshot",
		"sampleStats",
		"ShardMessenger",
		"ShardLink",
	])
		expect(name in Root).toBe(false);
	expect(manifest.dependencies.arktype).toBeString();
	expect(Reflect.get(manifest, "peerDependencies")?.arktype).toBeUndefined();
});

for (const [name, category] of Object.entries(categories)) {
	test(`virello/${name} shares every runtime identity with the root`, () => {
		expect(Object.keys(category).length).toBeGreaterThan(0);
		expect("default" in category).toBe(false);
		for (const [key, value] of Object.entries(category)) {
			expect(value).toBe(Root[key as keyof typeof Root]);
		}
	});
}

test("category imports keep shared services, registration state, and the single-client guard", async () => {
	expect(Client.container).toBe(container);
	expect(Commands.ApplicationCommandRegistries).toBe(
		ApplicationCommandRegistries,
	);
	expect(Commands.ApplicationCommandRegistries.registries).toBe(registries);
	expect(Commands.CorePreconditions).toBe(CorePreconditions);
	expect("VirelloClient" in Commands).toBe(false);
	expect("Command" in Time).toBe(false);
	const logger: Root.LoggerLike = {
		debug() {},
		notif() {},
		alert() {},
		error() {},
	};
	const client = new Client.VirelloClient({ intents: [], logger });
	try {
		expect(Root.container.client).toBe(client);
		expect(client).toBeInstanceOf(Root.VirelloClient);
		expect(() => new Root.VirelloClient({ intents: [], logger })).toThrow(
			"Only one VirelloClient can be active",
		);
		await client.load();
		expect(Client.container.tasks).toBe(Root.container.tasks);
		expect(Client.container.tasks).toBeInstanceOf(Scheduling.TaskScheduler);
		expect(Client.container.services).toBeInstanceOf(Services.Services);
		expect(Client.container.i18n).toBeInstanceOf(Localisation.LocaleManager);
		const registry =
			Commands.ApplicationCommandRegistries.acquire("category-identity");
		expect(Root.ApplicationCommandRegistries.acquire("category-identity")).toBe(
			registry,
		);
		expect(registry).toBeInstanceOf(Root.ApplicationCommandRegistry);
	} finally {
		await client.destroy();
	}
});

for (const specifier of [
	"virello",
	"virello/engine",
	...Object.keys(categories).map((name) => `virello/${name}`),
]) {
	test(`${specifier} can be imported first without opening resources`, async () => {
		const child = Bun.spawn(
			[
				process.execPath,
				join(import.meta.dir, "../fixtures/imports.ts"),
				specifier,
			],
			{
				cwd: join(import.meta.dir, "../.."),
				stdout: "pipe",
				stderr: "pipe",
				timeout: 15000,
			},
		);
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
		expect(stdout).toContain(`Cold import passed: ${specifier}`);
	}, 20000);
}

test("unlisted package paths cannot bypass the public surface", async () => {
	for (const path of baseline.privatePaths) {
		let errorCode: string | undefined;
		try {
			await import(path);
		} catch (error) {
			errorCode = (error as { code?: string }).code;
		}
		expect(["ERR_MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED"]).toContain(
			errorCode ?? "",
		);
	}
});
