import { afterEach, describe, expect, test } from "bun:test";
import { SlashCommandBuilder } from "virello/builders";
import {
	ApplicationCommandType,
	Locale,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import type { Resource } from "i18next";
import {
	ApplicationCommandRegistry,
	applyNameLocalizedBuilder,
	container,
	createLocalizedChoice,
	type InternationalizationOptions,
	VirelloClient,
	LocaleManager,
} from "virello";

let client: VirelloClient | undefined;
afterEach(async () => {
	await client?.destroy();
	client = undefined;
});
async function manager(
	resources: Resource = {},
	options: InternationalizationOptions = {},
) {
	const value = new LocaleManager({
		onDiagnostic: () => {},
		i18next: { resources },
		...options,
	});
	await value.init();
	return value;
}
const command = (): RESTPostAPIChatInputApplicationCommandsJSONBody => ({
	name: "paint",
	description: "Choose a colour",
	options: [
		{
			type: 3,
			name: "colour",
			description: "The colour",
			choices: [
				{ name: "Red", value: "red_id" },
				{ name: "Blue", value: "blue_id" },
			],
		},
	],
});
const resources: Resource = {
	fr: {
		commands: {
			paint: {
				name: "peindre",
				description: "Choisissez une couleur",
				options: {
					colour: {
						name: "couleur",
						description: "La couleur",
						choices: { red_id: "Rouge", blue_id: "Bleu" },
					},
				},
			},
		},
	},
	de: {
		commands: {
			paint: {
				name: "malen",
				description: "Wähle eine Farbe",
				options: {
					colour: {
						name: "farbe",
						description: "Die Farbe",
						choices: { red_id: "Rot", blue_id: "Blau" },
					},
				},
			},
		},
	},
};

describe("Discord command localisation", () => {
	test("honours custom separators and multiple default namespaces without response fallback", async () => {
		const i18n = await manager(
			{},
			{
				i18next: {
					nsSeparator: "|",
					keySeparator: false,
					defaultNS: ["first", "second"],
					resources: { fr: { first: {}, second: { "literal.key": "nom" } } },
				},
			},
		);
		expect(
			i18n.localizeCommand(
				{ name: "base", description: "Base" },
				{ name: "second|literal.key" },
			).name_localizations?.fr,
		).toBe("nom");
		expect(
			i18n.localizeCommand(
				{ name: "base", description: "Base" },
				{ name: "literal.key" },
			).name_localizations?.fr,
		).toBe("nom");
	});
	test("rejects custom interpolation syntax in static fields and accepts a literal value equal to its key", async () => {
		const i18n = await manager(
			{},
			{
				i18next: {
					interpolation: { prefix: "<%", suffix: "%>" },
					resources: {
						fr: { default: { name: "name", description: "Hello <%user%>" } },
					},
				},
			},
		);
		const result = i18n.localizeCommand(
			{ name: "base", description: "Base" },
			{ name: "name", description: "description" },
		);
		expect(result.name_localizations?.fr).toBe("name");
		expect(result.description_localizations?.fr).toBeUndefined();
		expect(i18n.diagnostics[0]?.code).toBe("invalid");
	});
	test("string and number choices retain values and explicit label maps", async () => {
		const i18n = await manager({
			fr: { default: { label: "traduit" } },
			de: { default: { label: "übersetzt" } },
		});
		const data: RESTPostAPIChatInputApplicationCommandsJSONBody = {
			name: "number",
			description: "Number",
			options: [
				{
					type: 10,
					name: "value",
					description: "Value",
					choices: [
						{
							name: "Pi",
							value: 3.14,
							name_localizations: { fr: "explicite" },
						},
					],
				},
			],
		};
		const result = i18n.localizeCommand(data, {
			options: { value: { choices: [{ value: 3.14, name: "label" }] } },
		});
		const option = result.options![0]!;
		expect("choices" in option && option.choices?.[0]).toEqual({
			name: "Pi",
			value: 3.14,
			name_localizations: { "en-US": "Pi", fr: "explicite", de: "übersetzt" },
		});
	});
	test("invalid choice labels fall back and explicit invalid choice labels reject", async () => {
		const i18n = await manager({ fr: { default: { label: "x".repeat(101) } } });
		const result = i18n.localizeCommand(command(), {
			options: { colour: { choices: [{ value: "red_id", name: "label" }] } },
		});
		const option = result.options![0]!;
		expect(
			"choices" in option && option.choices?.[0]?.name_localizations?.fr,
		).toBeUndefined();
		expect(i18n.diagnostics[0]?.path).toContain("red_id");
		const bad = command();
		const choice = bad.options![0]!;
		if ("choices" in choice)
			choice.choices![0]!.name_localizations = { fr: "" };
		expect(() => i18n.localizeCommand(bad, {})).toThrow("explicit choice");
	});
	test("valid nested shorthand preserves group and subcommand routing", async () => {
		const i18n = await manager({
			fr: {
				default: {
					root: {
						name: "racine",
						description: "Racine",
						options: {
							group: {
								name: "groupe",
								description: "Groupe",
								options: { sub: { name: "sous", description: "Sous" } },
							},
						},
					},
				},
			},
		});
		const data: RESTPostAPIChatInputApplicationCommandsJSONBody = {
			name: "root",
			description: "Root",
			options: [
				{
					type: 2,
					name: "group",
					description: "Group",
					options: [{ type: 1, name: "sub", description: "Sub" }],
				},
			],
		};
		const result = i18n.localizeCommand(data, "root");
		const group = result.options![0]!;
		expect(group.name).toBe("group");
		expect(group.name_localizations?.fr).toBe("groupe");
		expect(
			"options" in group && group.options![0]!.name_localizations?.fr,
		).toBe("sous");
		expect(i18n.diagnostics).toHaveLength(0);
	});
	test("generates names/descriptions/options/choices in multiple locales without mutating input or operational values", async () => {
		const i18n = await manager(resources);
		const original = command(),
			snapshot = structuredClone(original);
		const data = i18n.localizeCommand(original, "commands:paint");
		expect(data.name).toBe("paint");
		expect(data.description).toBe("Choose a colour");
		expect(data.name_localizations).toEqual({
			"en-US": "paint",
			fr: "peindre",
			de: "malen",
		});
		expect(data.description_localizations?.fr).toBe("Choisissez une couleur");
		const option = data.options![0]!;
		expect(option.name).toBe("colour");
		expect(option.name_localizations?.de).toBe("farbe");
		expect("choices" in option && option.choices?.[0]).toEqual({
			name: "Red",
			value: "red_id",
			name_localizations: { "en-US": "Red", fr: "Rouge", de: "Rot" },
		});
		expect(original).toEqual(snapshot);
		expect(i18n.diagnostics).toHaveLength(0);
	});
	test("uses explicit keys for groups/subcommands/options and matches choice values by type", async () => {
		const i18n = await manager({
			fr: {
				default: {
					group: "groupe",
					sub: "ajouter",
					count: "nombre",
					choice: "Un",
					desc: "Description française",
				},
			},
		});
		const payload = {
			name: "admin",
			description: "Admin",
			options: [
				{
					type: 2,
					name: "tools",
					description: "Tools",
					options: [
						{
							type: 1,
							name: "add",
							description: "Add",
							options: [
								{
									type: 4,
									name: "count",
									description: "Count",
									choices: [{ name: "One", value: 1 }],
								},
							],
						},
					],
				},
			],
		} as RESTPostAPIChatInputApplicationCommandsJSONBody;
		const result = i18n.localizeCommand(payload, {
			options: {
				tools: {
					name: "group",
					options: {
						add: {
							name: "sub",
							description: "desc",
							options: {
								count: {
									name: "count",
									choices: [{ value: 1, name: "choice" }],
								},
							},
						},
					},
				},
			},
		});
		const group = result.options![0]!;
		expect(group.name_localizations?.fr).toBe("groupe");
		if (!("options" in group))
			throw new Error("Missing subcommand group options");
		const sub = group.options![0]!;
		expect(sub.name_localizations?.fr).toBe("ajouter");
		if (!("options" in sub)) throw new Error("Missing subcommand options");
		const count = sub.options![0]!;
		expect(count.name_localizations?.fr).toBe("nombre");
		expect("choices" in count && count.choices?.[0]?.value).toBe(1);
		expect(() =>
			i18n.localizeCommand(command(), {
				options: { colour: { choices: [{ value: 1, name: "choice" }] } },
			}),
		).toThrow("stable choice");
	});
	test("explicit maps win per locale; explicit null suppresses generation for the field", async () => {
		const i18n = await manager(resources);
		const input = command();
		input.name_localizations = { fr: "personnalisé" };
		input.description_localizations = null;
		input.options![0]!.name_localizations = { fr: null };
		const result = i18n.localizeCommand(input, "commands:paint");
		expect(result.name_localizations).toEqual({
			"en-US": "paint",
			fr: "personnalisé",
			de: "malen",
		});
		expect(result.description_localizations).toBeNull();
		expect(result.options![0]!.name_localizations?.fr).toBeNull();
	});
	test("missing translations omit keys and never copy i18next response fallbacks into another locale", async () => {
		const i18n = await manager({
			"en-US": {
				default: { name: "english", description: "English description" },
			},
			fr: { default: { name: "français" } },
			de: { default: {} },
		});
		const data = i18n.localizeCommand(
			{ name: "stable", description: "Base" },
			{ name: "name", description: "description" },
		);
		expect(data.name_localizations).toEqual({
			"en-US": "stable",
			fr: "français",
		});
		expect(data.description_localizations).toEqual({ "en-US": "Base" });
		expect(i18n.diagnostics.filter((d) => d.code === "missing")).toHaveLength(
			3,
		);
		expect(i18n.format("de", "description")).toBe("English description");
	});
	test("pins the base locale against en-US/en-GB regional fallback and retains es-419 as an exact locale", async () => {
		const i18n = await manager({
			"en-GB": { default: { name: "colour" } },
			"es-419": { default: { name: "color" } },
			"es-ES": { default: { name: "colorear" } },
		});
		const data = i18n.localizeCommand(
			{ name: "color", description: "Colour" },
			{ name: "name" },
		);
		expect(data.name_localizations).toEqual({
			"en-US": "color",
			"en-GB": "colour",
			"es-419": "color",
			"es-ES": "colorear",
		});
	});
	test("supports every currently documented Discord locale without alias inference", async () => {
		const all = Object.fromEntries(
			Object.values(Locale).map((locale) => [
				locale,
				{ default: { name: "translated" } },
			]),
		);
		const i18n = await manager(all);
		const data = i18n.localizeCommand(
			{ name: "base", description: "Base" },
			{ name: "name" },
		);
		expect(Object.keys(data.name_localizations!)).toHaveLength(32);
		expect(data.name_localizations?.[Locale.SpanishLATAM]).toBe("translated");
	});
	test("retains response-only languages and diagnoses unsupported Discord IDs", async () => {
		const i18n = await manager({ "fr-FR": { default: { name: "nom" } } });
		const data = i18n.localizeCommand(
			{ name: "base", description: "Base" },
			{ name: "name" },
		);
		expect(data.name_localizations).toEqual({ "en-US": "base" });
		expect(i18n.getT("fr-FR")("name")).toBe("nom");
		expect(i18n.diagnostics[0]?.code).toBe("unsupportedLocale");
	});
	test("configured Discord locale subset and explicit default locale work with a generic response language", async () => {
		const i18n = await manager(
			{
				en: { default: { name: "base" } },
				fr: { default: { name: "français" } },
				de: { default: { name: "deutsch" } },
			},
			{
				defaultName: "en",
				discord: { defaultLocale: Locale.EnglishUS, locales: [Locale.French] },
				i18next: {
					resources: {
						fr: { default: { name: "français" } },
						de: { default: { name: "deutsch" } },
					},
				},
			},
		);
		expect(
			i18n.localizeCommand(
				{ name: "base", description: "Base" },
				{ name: "name" },
			).name_localizations,
		).toEqual({
			"en-US": "base",
			fr: "français",
		});
	});
	test.each(
		[
			"UPPER",
			"two words",
			"bad!",
			"",
			"a".repeat(33),
			123,
			null,
			{},
			["name"],
			"{{name}}",
			"$t(absent)",
		].map((value) => ({ value })),
	)("bad generated name %j is diagnosed and omitted", async ({ value }) => {
		const i18n = await manager({ fr: { default: { name: value } } });
		const data = i18n.localizeCommand(
			{ name: "base", description: "Base" },
			{ name: "name" },
		);
		expect(data.name_localizations?.fr).toBeUndefined();
		expect(
			i18n.diagnostics.some(
				(d) => d.code === "invalid" || d.code === "missing",
			),
		).toBe(true);
	});
	test.each(["हिन्दी", "ภาษาไทย", "日本語", "中文", "слово", "ʼtest", "𐐨"])(
		"accepts Discord Unicode name %s",
		async (name) => {
			const i18n = await manager({ fr: { default: { name } } });
			expect(
				i18n.localizeCommand(
					{ name: "base", description: "Base" },
					{ name: "name" },
				).name_localizations?.fr,
			).toBe(name);
		},
	);
	test("description/choice length uses Unicode code points, allowing spaces and mixed case", async () => {
		const i18n = await manager({
			fr: {
				default: { description: "😀".repeat(100), choice: "Mixed Case Choice" },
			},
		});
		const result = i18n.localizeCommand(command(), {
			description: "description",
			options: { colour: { choices: [{ value: "red_id", name: "choice" }] } },
		});
		expect(result.description_localizations?.fr).toBe("😀".repeat(100));
		expect(i18n.diagnostics).toHaveLength(0);
	});
	test.each(["", "x".repeat(101), false, {}])(
		"bad generated description %j is diagnosed and omitted",
		async (description) => {
			const i18n = await manager({ fr: { default: { description } } });
			expect(
				i18n.localizeCommand(command(), { description: "description" })
					.description_localizations?.fr,
			).toBeUndefined();
			expect(i18n.diagnostics).toHaveLength(1);
		},
	);
	test("generated sibling-name collisions fall back, including a different sibling base and regional fallback", async () => {
		const i18n = await manager({
			fr: { default: { first: "second", second: "autre" } },
			"en-GB": { default: { first: "same", second: "same" } },
		});
		const payload = {
			name: "base",
			description: "Base",
			options: [
				{ type: 3, name: "first", description: "First" },
				{ type: 3, name: "second", description: "Second" },
			],
		} as RESTPostAPIChatInputApplicationCommandsJSONBody;
		const result = i18n.localizeCommand(payload, {
			options: { first: { name: "first" }, second: { name: "second" } },
		});
		expect(result.options![0]!.name_localizations?.fr).toBeUndefined();
		expect(result.options![1]!.name_localizations?.fr).toBe("autre");
		expect(result.options![1]!.name_localizations?.["en-GB"]).toBeUndefined();
		expect(i18n.diagnostics.filter((d) => d.code === "invalid")).toHaveLength(
			2,
		);
	});
	test("conflicting explicit maps and malformed base payloads fail before queuing", async () => {
		const i18n = await manager();
		const data = command();
		data.name = "BAD";
		expect(() => i18n.localizeCommand(data, {})).toThrow("base text");
		data.name = "paint";
		data.name_localizations = { xx: "name" } as never;
		expect(() => i18n.localizeCommand(data, {})).toThrow("Unsupported Discord");
		delete data.name_localizations;
		data.options = [
			{
				type: 3,
				name: "first",
				description: "One",
				name_localizations: { fr: "same" },
			},
			{
				type: 3,
				name: "second",
				description: "Two",
				name_localizations: { fr: "same" },
			},
		];
		expect(() => i18n.localizeCommand(data, {})).toThrow(
			"Conflicting explicit",
		);
	});
	test("strict translation diagnostics reject the affected registration", async () => {
		const i18n = await manager(
			{ fr: { default: {} } },
			{
				discord: { strict: true },
				i18next: { resources: { fr: { default: {} } } },
			},
		);
		expect(() => i18n.localizeCommand(command(), { name: "missing" })).toThrow(
			"Missing command translation",
		);
		expect(i18n.diagnostics).toHaveLength(1);
	});
	test("key selection typos, unsupported locales and an uninitialised manager are explicit errors", async () => {
		const i18n = await manager();
		expect(() =>
			i18n.localizeCommand(command(), { options: { unknown: { name: "x" } } }),
		).toThrow("Unknown base option");
		expect(
			() => new LocaleManager({ discord: { locales: ["fr-FR"] } as never }),
		).toThrow("supported Discord");
		expect(() => new LocaleManager().localizeCommand(command(), {})).toThrow(
			"Initialise",
		);
	});
	test("validates choices, nesting, required ordering and maximum sibling counts", async () => {
		const i18n = await manager();
		const bad = command();
		bad.options = Array.from({ length: 26 }, (_, i) => ({
			type: 3,
			name: `option${i}`,
			description: "Option",
		}));
		expect(() => i18n.localizeCommand(bad, {})).toThrow("25 siblings");
		bad.options = [
			{ type: 3, name: "first", description: "Optional" },
			{ type: 3, name: "second", description: "Required", required: true },
		];
		expect(() => i18n.localizeCommand(bad, {})).toThrow("Required options");
		bad.options = [
			{
				type: 3,
				name: "value",
				description: "Value",
				choices: [{ name: "X", value: "x".repeat(101) }],
			},
		];
		expect(() => i18n.localizeCommand(bad, {})).toThrow("choice value");
		bad.options = [
			{
				type: 3,
				name: "value",
				description: "Value",
				autocomplete: true,
				choices: [{ name: "X", value: "x" }],
			},
		] as never;
		expect(() => i18n.localizeCommand(bad, {})).toThrow("autocomplete");
		bad.options = [
			{
				type: 2,
				name: "group",
				description: "Group",
				options: [{ type: 3, name: "value", description: "Invalid" }],
			},
		] as never;
		expect(() => i18n.localizeCommand(bad, {})).toThrow("nesting");
	});
	test("counts longest localised field, base and choice values against the 8000-character budget", async () => {
		const i18n = await manager();
		const data = command();
		data.options = Array.from({ length: 25 }, (_, i) => ({
			type: 3,
			name: `option${i}`,
			description: "d".repeat(100),
			choices: Array.from({ length: 3 }, (_, j) => ({
				name: "n".repeat(100),
				value: `${j}`.repeat(100),
			})),
		}));
		expect(() => i18n.localizeCommand(data, {})).toThrow("8000");
	});
	test("localises context menu names with spaces while retaining the base route", async () => {
		const i18n = await manager({ fr: { default: { name: "Voir le profil" } } });
		const result = i18n.localizeCommand(
			{ type: ApplicationCommandType.User, name: "View Profile" },
			{ name: "name" },
		);
		expect(result.name).toBe("View Profile");
		expect(result.name_localizations?.fr).toBe("Voir le profil");
		expect("description_localizations" in result).toBe(false);
	});
	test("registry builder/object paths use the same manager and queue only base routing names", async () => {
		client = new VirelloClient({
			intents: [],
			extensions: {
				localisation: { i18next: { resources }, onDiagnostic: () => {} },
			},
		});
		await container.i18n.init();
		const builder = new SlashCommandBuilder()
			.setName("paint")
			.setDescription("Choose a colour")
			.addStringOption((o) =>
				o
					.setName("colour")
					.setDescription("The colour")
					.addChoices({ name: "Red", value: "red_id" }),
			);
		const registry = new ApplicationCommandRegistry("paint");
		registry.registerChatInputCommand(builder, {
			localisation: "commands:paint",
		});
		expect(registry.chatInputCommands.has("paint")).toBe(true);
		expect(registry.chatInputCommands.has("peindre")).toBe(false);
		expect(registry["apiCalls"][0]!.builtData.name_localizations?.fr).toBe(
			"peindre",
		);
		expect(builder.toJSON().name_localizations).toBeUndefined();
		registry.registerChatInputCommand(
			{
				name: "paint",
				description: "Choose a colour",
				name_localizations: { fr: "explicite" },
			},
			{ localisation: { name: "commands:paint.name" } },
		);
		expect(registry["apiCalls"][1]!.builtData.name_localizations?.fr).toBe(
			"explicite",
		);
		registry.registerContextMenuCommand(
			{ name: "Paint", type: ApplicationCommandType.Message },
			{ localisation: { name: "commands:paint.name" } },
		);
		expect(registry["apiCalls"][2]!.builtData.name).toBe("Paint");
	});
	test("bad translations isolate one registry call; ordinary registration works with localisation disabled", async () => {
		client = new VirelloClient({
			intents: [],
			extensions: { localisation: false },
		});
		const registry = new ApplicationCommandRegistry("paint");
		expect(() =>
			registry.registerChatInputCommand(
				{ name: "paint", description: "Paint" },
				{ localisation: "commands:paint" },
			),
		).toThrow("requires");
		expect(registry["apiCalls"]).toHaveLength(0);
		registry.registerChatInputCommand({ name: "paint", description: "Paint" });
		expect(registry["apiCalls"]).toHaveLength(1);
	});
	test("legacy helpers preserve pre-set base names, explicit maps and exact choice values without a process-global cache", async () => {
		client = new VirelloClient({
			intents: [],
			extensions: {
				localisation: { i18next: { resources }, onDiagnostic: () => {} },
			},
		});
		await container.i18n.init();
		const builder = new SlashCommandBuilder()
			.setName("stable")
			.setDescription("Base")
			.setNameLocalization(Locale.French, "explicit");
		applyNameLocalizedBuilder(builder, "commands:paint.name");
		expect(builder.name).toBe("stable");
		expect(builder.name_localizations?.fr).toBe("explicit");
		expect(() =>
			applyNameLocalizedBuilder(new SlashCommandBuilder(), "x"),
		).toThrow("stable base name");
		expect(
			createLocalizedChoice("commands:paint.name", {
				name: "Base",
				value: "unchanged",
			}).value,
		).toBe("unchanged");
		await client.destroy();
		client = new VirelloClient({
			intents: [],
			extensions: {
				localisation: {
					i18next: { resources: { fr: { default: { name: "nouveau" } } } },
					onDiagnostic: () => {},
				},
			},
		});
		await container.i18n.init();
		const second = new SlashCommandBuilder().setName("base");
		applyNameLocalizedBuilder(second, "name");
		expect(second.name_localizations?.fr).toBe("nouveau");
	});
});
