import { afterEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { container, VirelloClient, LocaleManager } from "virello";

const folders: string[] = [];
let client: VirelloClient | undefined;
afterEach(async () => {
	await client?.destroy();
	client = undefined;
	for (const folder of folders.splice(0)) {
		if (!resolve(folder).startsWith(resolve(tmpdir()) + sep))
			throw new Error("Unsafe fixture path");
		rmSync(folder, { recursive: true, force: true });
	}
});
function fixture() {
	const folder = mkdtempSync(join(tmpdir(), "virello-locales-"));
	folders.push(folder);
	return folder;
}
function file(root: string, path: string, value: unknown) {
	const target = join(root, path);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, JSON.stringify(value));
}
const silent = { onDiagnostic: () => {} };

describe("owned startup resource loader", () => {
	test("no discovery path is interpolated from resource keys", async () => {
		const root = fixture();
		file(root, "en-US/default.json", { safe: "safe" });
		file(root, "outside.json", { secret: "outside" });
		const i18n = new LocaleManager({
			defaultLanguageDirectory: root,
			...silent,
		});
		await i18n.init();
		expect(i18n.format("en-US", "../../outside:secret")).toBe("");
		expect([...i18n.namespaces]).toEqual(["default"]);
	});
	test("inline cyclic and non-JSON data reject without corrupting another manager", async () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		for (const bad of [cyclic, { date: new Date() }, { invalid: Infinity }]) {
			const i18n = new LocaleManager({
				...silent,
				i18next: { resources: { "en-US": { default: bad } } },
			});
			await expect(i18n.init()).rejects.toThrow();
			expect(i18n.languagesLoaded).toBe(false);
		}
		const good = new LocaleManager({
			...silent,
			i18next: { resources: { "en-US": { default: { safe: "safe" } } } },
		});
		await good.init();
		expect(good.format("en-US", "safe")).toBe("safe");
	});
	test("reads nested JSON namespaces from root-relative paths with spaces and Unicode", async () => {
		const root = fixture();
		file(root, "my langues été/en-US/default.json", {
			hello: "Hello {{name}}",
			items_one: "{{count}} item",
			items_other: "{{count}} items",
		});
		file(root, "my langues été/fr/commands/admin.json", { help: "Aide" });
		file(root, "my langues été/en-US/commands/admin.json", { help: "Help" });
		client = new VirelloClient({
			intents: [],
			root: pathToFileURL(root + sep),
			extensions: {
				localisation: { defaultLanguageDirectory: "my langues été", ...silent },
			},
		});
		const manager = container.i18n;
		expect(manager.languagesLoaded).toBe(false);
		await manager.init();
		expect(manager.languagesDirectory).toBe(join(root, "my langues été"));
		expect(manager.format("en-US", "hello", { name: "Virello" })).toBe(
			"Hello Virello",
		);
		expect(manager.format("en-US", "items", { count: 2 })).toBe("2 items");
		expect(manager.format("fr", "commands/admin:help")).toBe("Aide");
		expect([...manager.namespaces]).toEqual(["commands/admin", "default"]);
	});
	test("initialises once, snapshots resources and only a new manager sees file changes", async () => {
		const root = fixture();
		file(root, "en-US/default.json", { value: "first" });
		const options = { defaultLanguageDirectory: root, ...silent };
		const manager = new LocaleManager(options);
		const init = manager.init();
		expect(manager.init()).toBe(init);
		await init;
		file(root, "en-US/default.json", { value: "second" });
		await manager.init();
		expect(manager.format("en-US", "value")).toBe("first");
		const next = new LocaleManager(options);
		await next.init();
		expect(next.format("en-US", "value")).toBe("second");
		expect(manager.format("en-US", "value")).toBe("first");
		expect(manager.instance).not.toBe(next.instance);
	});
	test("skips prefixed paths, non-JSON files and symlink directories", async () => {
		const root = fixture(),
			outside = fixture();
		file(root, "en-US/default.json", { ok: "yes" });
		file(outside, "de/default.json", { secret: "no" });
		for (const prefix of [".", "_", "-"]) {
			file(root, `${prefix}fr/default.json`, { skip: "x" });
			file(root, `en-US/${prefix}private.json`, { skip: "x" });
			file(root, `en-US/${prefix}nested/secret.json`, { skip: "x" });
		}
		file(root, "en-US/script.ts", { skip: "x" });
		file(root, "en-US/file.json.backup", { skip: "x" });
		symlinkSync(outside, join(root, "linked"), "junction");
		const manager = new LocaleManager({
			defaultLanguageDirectory: root,
			...silent,
		});
		await manager.init();
		expect([...manager.languages.keys()]).toEqual(["en-US"]);
		expect([...manager.namespaces]).toEqual(["default"]);
	});
	test("additional directories discover their own locales and first valid namespace wins", async () => {
		const first = fixture(),
			second = fixture();
		file(first, "en-US/default.json", { value: "first" });
		file(second, "en-US/default.json", {
			value: "second",
			other: "not merged",
		});
		file(second, "fr/default.json", { value: "bonjour" });
		file(first, "en-US/broken.json", {});
		writeFileSync(join(first, "en-US/broken.json"), "{bad");
		file(second, "en-US/broken.json", { fixed: "yes" });
		const manager = new LocaleManager({
			defaultLanguageDirectory: first,
			resourceDirectories: [first, second],
			...silent,
		});
		await manager.init();
		expect(manager.format("en-US", "value")).toBe("first");
		expect(manager.format("en-US", "other")).toBe("");
		expect(manager.format("fr", "value")).toBe("bonjour");
		expect(manager.format("en-US", "broken:fixed")).toBe("yes");
		expect(manager.diagnostics.map((x) => x.code)).toEqual([
			"resource",
			"duplicate",
		]);
		expect(manager.diagnostics[0]?.path).toBe(join(first, "en-US/broken.json"));
		expect(manager.diagnostics[0]?.cause).toBeDefined();
	});
	test("malformed or non-object namespaces are isolated and missing explicit roots are diagnosed", async () => {
		const root = fixture();
		file(root, "en-US/good.json", { ok: "yes" });
		file(root, "en-US/array.json", []);
		file(root, "en-US/null.json", null);
		file(root, "en-US/string.json", "bad");
		const manager = new LocaleManager({
			defaultLanguageDirectory: root,
			resourceDirectories: [join(root, "missing")],
			...silent,
		});
		await manager.init();
		expect(manager.format("en-US", "good:ok")).toBe("yes");
		expect(
			manager.diagnostics.filter((x) => x.code === "resource"),
		).toHaveLength(4);
	});
	test("empty/missing implicit languages directory is valid and has a usable default translator", async () => {
		client = new VirelloClient({ intents: [], root: fixture() });
		await container.i18n.init();
		expect(container.i18n.diagnostics).toHaveLength(0);
		expect(
			container.i18n.format("en-US", "none", { defaultValue: "default" }),
		).toBe("default");
	});
	test("inline bundles override whole disk namespaces and do not retain mutable references", async () => {
		const root = fixture();
		file(root, "en-US/default.json", { value: "disk", diskOnly: "gone" });
		const resources = {
			"en-US": { default: { value: "inline", array: ["a", "b"] } },
		};
		const manager = new LocaleManager({
			defaultLanguageDirectory: root,
			i18next: { resources },
			...silent,
		});
		await manager.init();
		resources["en-US"].default.value = "mutated";
		expect(manager.format("en-US", "value")).toBe("inline");
		expect(manager.format("en-US", "diskOnly")).toBe("");
		expect(manager.getT("en-US")("array", { returnObjects: true })).toEqual([
			"a",
			"b",
		]);
	});
	test("response fallback, default namespace, missing key, custom formatter and per-manager engine survive", async () => {
		const manager = new LocaleManager({
			...silent,
			defaultName: "en-US",
			defaultNS: "common",
			defaultMissingKey: "missing",
			i18next: {
				resources: {
					"en-US": {
						common: {
							hello: "Hello {{name, upper}}",
							missing: "Missing {{key}}",
						},
					},
					fr: { common: {} },
				},
			},
			formatters: [
				{ name: "upper", format: (value) => String(value).toUpperCase() },
			],
		});
		await manager.init();
		expect(manager.format("fr", "hello", { name: "virello" })).toBe(
			"Hello VIRELLO",
		);
		expect(manager.format("fr", "absent")).toBe("Missing absent");
		expect(() => manager.getT("unknown")).toThrow("Invalid language");
	});
	test("dynamic i18next settings receive discovered locales/namespaces", async () => {
		const root = fixture();
		file(root, "fr/messages.json", { hello: "salut" });
		let observed: unknown;
		const manager = new LocaleManager({
			defaultLanguageDirectory: root,
			...silent,
			i18next: (namespaces, languages) => {
				observed = { namespaces, languages };
				return { defaultNS: "messages", fallbackLng: "fr" };
			},
		});
		await manager.init();
		expect(observed).toEqual({ namespaces: ["messages"], languages: ["fr"] });
		expect(manager.format("en-US", "hello")).toBe("salut");
	});
	test.each(["__proto__", "constructor", "prototype"])(
		"rejects unsafe JSON key %s without poisoning later resources",
		async (key) => {
			const root = fixture();
			mkdirSync(join(root, "en-US"));
			writeFileSync(
				join(root, "en-US/bad.json"),
				`{"${key}":{"polluted":"yes"}}`,
			);
			file(root, "en-US/good.json", { ok: "safe" });
			const manager = new LocaleManager({
				defaultLanguageDirectory: root,
				...silent,
			});
			await manager.init();
			expect(manager.diagnostics[0]?.code).toBe("resource");
			expect(manager.format("en-US", "good:ok")).toBe("safe");
			expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		},
	);
	test("invalid inline resources reject initialisation once and never mark the manager ready", async () => {
		const manager = new LocaleManager({
			...silent,
			i18next: { resources: { "en-US": { default: [] } } as never },
		});
		const init = manager.init();
		await expect(init).rejects.toThrow();
		expect(manager.init()).toBe(init);
		expect(manager.languagesLoaded).toBe(false);
	});
	test.each([
		"backend",
		"saveMissing",
		"partialBundledLanguages",
		"updateMissing",
	])("unsupported engine I/O option %s is rejected", async (key) => {
		const manager = new LocaleManager({ ...silent, i18next: { [key]: true } });
		await expect(manager.init()).rejects.toThrow("startup resources");
	});
	test("removed backend paths fail with explicit migration guidance", () => {
		expect(
			() => new LocaleManager({ backend: { paths: [] } } as never),
		).toThrow("resourceDirectories");
	});
});
