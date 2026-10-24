import { Locale, type LocalizationMap } from "discord-api-types/v10";
import {
	ApplicationCommandType,
	type RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import type { LocaleManager } from "./LocaleManager";
import type { CommandLocalisation, LocalisationDiagnostic } from "./types";

export const discordLocales: ReadonlySet<string> = new Set(
	Object.values(Locale),
);
const regionalFallbacks: Readonly<Record<string, string>> = {
	"en-US": "en-GB",
	"en-GB": "en-US",
	"es-419": "es-ES",
};
const slashName = /^[-_\u02BC\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;
type FieldKind = "slashName" | "contextName" | "description" | "choice";
interface Node {
	name: string;
	name_localizations?: LocalizationMap | null;
	description?: string;
	description_localizations?: LocalizationMap | null;
	type?: number;
	value?: string | number;
	options?: Node[];
	choices?: Node[];
	required?: boolean;
	autocomplete?: boolean;
}
const length = (text: string) => [...text].length;
function fail(path: string, message: string): never {
	throw new TypeError(`Command localisation [${path}]: ${message}`);
}
function valid(value: unknown, kind: FieldKind): value is string {
	return (
		typeof value === "string" &&
		length(value) >= 1 &&
		length(value) <=
			(kind === "slashName" || kind === "contextName" ? 32 : 100) &&
		(kind !== "slashName" ||
			(slashName.test(value) && value === value.toLowerCase()))
	);
}
function validateField(
	base: unknown,
	map: LocalizationMap | null | undefined,
	kind: FieldKind,
	path: string,
) {
	if (!valid(base, kind)) fail(path, `Invalid ${kind} base text.`);
	if (map == null) return;
	if (typeof map !== "object" || Array.isArray(map))
		fail(path, "Localisations must be a map or null.");
	for (const [locale, value] of Object.entries(map)) {
		if (!discordLocales.has(locale))
			fail(path, `Unsupported Discord locale "${locale}".`);
		if (value !== null && !valid(value, kind))
			fail(path, `Invalid explicit ${kind} for ${locale}.`);
	}
}

/** Exact-language lookup: Discord, not i18next's response fallback chain, owns command presentation fallback. */
export function commandTranslation(
	manager: LocaleManager,
	locale: string,
	key: string,
): unknown {
	const options = manager.instance.options;
	const separator =
		options.nsSeparator === false ? undefined : (options.nsSeparator ?? ":");
	const index = separator ? key.indexOf(separator) : -1;
	const defaults = options.defaultNS;
	const namespaces =
		index < 0
			? Array.isArray(defaults)
				? defaults
				: [defaults || "default"]
			: [key.slice(0, index)];
	const resourceKey = index < 0 ? key : key.slice(index + separator!.length);
	for (const namespace of namespaces) {
		const value = manager.instance.getResource(locale, namespace, resourceKey);
		if (value !== undefined) return value;
	}
	return undefined;
}

function diagnostic(manager: LocaleManager, issue: LocalisationDiagnostic) {
	manager.report(issue);
	if (manager.options.discord?.strict)
		fail(issue.path ?? issue.key ?? "command", issue.message);
}

export function commandLocales(manager: LocaleManager): string[] {
	if (!manager.languagesLoaded)
		throw new Error("Initialise LocaleManager before localising commands.");
	const locales = manager.options.discord?.locales ?? [
		...manager.languages.keys(),
	];
	return [...new Set(locales)].filter((locale) => {
		if (discordLocales.has(locale)) return true;
		diagnostic(manager, {
			code: "unsupportedLocale",
			locale,
			message:
				"Response language is not a Discord locale; command presentation skipped.",
		});
		return false;
	});
}

export function fieldLocalizations(
	manager: LocaleManager,
	key: string,
	base: string,
	kind: FieldKind,
	explicit: LocalizationMap | null | undefined,
	path: string,
	locales = commandLocales(manager),
): LocalizationMap | null {
	validateField(base, explicit, kind, path);
	if (typeof key !== "string" || !key.trim())
		fail(path, "Translation keys must be non-empty strings.");
	if (explicit === null) return null;
	const defaultLocale =
		manager.options.discord?.defaultLocale ??
		manager.options.defaultName ??
		"en-US";
	if (!discordLocales.has(defaultLocale))
		fail(
			path,
			"Set discord.defaultLocale to the Discord locale of your base text.",
		);
	const output = { ...explicit } as Record<string, string | null>;
	// Pin the base locale, even when equal to the base, to prevent Discord's regional fallback changing it.
	if (!Object.hasOwn(output, defaultLocale)) output[defaultLocale] = base;
	for (const locale of locales) {
		if (Object.hasOwn(output, locale)) continue;
		const text = commandTranslation(manager, locale, key);
		if (text === undefined) {
			diagnostic(manager, {
				code: "missing",
				locale,
				key,
				path,
				message: "Missing command translation; using Discord fallback.",
			});
			continue;
		}
		const interpolation = manager.instance.options.interpolation;
		const dynamicPrefixes = [
			interpolation?.prefix ?? "{{",
			interpolation?.nestingPrefix ?? "$t(",
		];
		if (
			!valid(text, kind) ||
			dynamicPrefixes.some((prefix) => prefix && text.includes(prefix))
		) {
			diagnostic(manager, {
				code: "invalid",
				locale,
				key,
				path,
				message: `Invalid static ${kind} translation; using Discord fallback.`,
			});
			continue;
		}
		output[locale] = text;
	}
	return output as LocalizationMap;
}

/** Validate the supported command presentation tree before it can enter the REST queue. */
function validateTree(
	node: Node,
	path: string,
	level: "root" | "group" | "subcommand" | "option",
	context = false,
): number {
	validateField(
		node.name,
		node.name_localizations,
		context ? "contextName" : "slashName",
		`${path}.name`,
	);
	const longest = (base: string, map?: LocalizationMap | null) =>
		Math.max(
			length(base),
			...Object.values(map ?? {})
				.filter((x): x is string => typeof x === "string")
				.map(length),
		);
	let size = longest(node.name, node.name_localizations);
	if (context) {
		if (
			node.description ||
			node.description_localizations ||
			node.options?.length
		)
			fail(path, "Context menus only support name localisation.");
		return size;
	}
	validateField(
		node.description,
		node.description_localizations,
		"description",
		`${path}.description`,
	);
	size += longest(node.description!, node.description_localizations);
	if (level === "group" && !node.options?.length)
		fail(path, "A subcommand group requires at least one subcommand.");
	if (node.choices !== undefined) {
		if (
			!Array.isArray(node.choices) ||
			node.choices.length > 25 ||
			![3, 4, 10].includes(node.type!)
		)
			fail(
				path,
				"Choices require a string/integer/number option and at most 25 entries.",
			);
		if (node.autocomplete)
			fail(path, "Choices and autocomplete cannot be combined.");
		for (const choice of node.choices) {
			validateField(
				choice.name,
				choice.name_localizations,
				"choice",
				`${path}.choices[${String(choice.value)}]`,
			);
			if (
				node.type === 3
					? typeof choice.value !== "string" || length(choice.value) > 100
					: typeof choice.value !== "number" ||
						!Number.isFinite(choice.value) ||
						Math.abs(choice.value) > 2 ** 53 ||
						(node.type === 4 && !Number.isSafeInteger(choice.value))
			)
				fail(path, "Invalid stable choice value for its option type.");
			size +=
				longest(choice.name, choice.name_localizations) +
				length(String(choice.value));
		}
	}
	if (node.options !== undefined) {
		if (
			!Array.isArray(node.options) ||
			node.options.length > 25 ||
			level === "option"
		)
			fail(path, "Invalid nested options or more than 25 siblings.");
		const names = new Set<string>();
		let optional = false;
		const nested = node.options.some(
			(option) => option.type === 1 || option.type === 2,
		);
		for (const option of node.options) {
			if (
				!Number.isInteger(option.type) ||
				option.type! < 1 ||
				option.type! > 11
			)
				fail(path, "Unsupported option type.");
			if (names.has(option.name))
				fail(path, `Duplicate base option name "${option.name}".`);
			names.add(option.name);
			if (
				level === "group"
					? option.type !== 1
					: level === "subcommand"
						? option.type! < 3
						: nested && option.type! > 2
			)
				fail(path, "Invalid subcommand/group nesting.");
			if (option.type! < 3 && option.required !== undefined)
				fail(path, "Subcommands/groups cannot be required.");
			if (option.type! >= 3) {
				if (optional && option.required)
					fail(path, "Required options must precede optional options.");
				optional ||= !option.required;
			}
			size += validateTree(
				option,
				`${path}.${option.name}`,
				option.type === 2
					? "group"
					: option.type === 1
						? "subcommand"
						: "option",
			);
		}
	}
	return size;
}

export function localizeCommand<
	T extends RESTPostAPIApplicationCommandsJSONBody,
>(
	manager: LocaleManager,
	data: T,
	keys: CommandLocalisation,
): T &
	Pick<
		RESTPostAPIApplicationCommandsJSONBody,
		"name_localizations" | "description_localizations"
	> {
	const locales = commandLocales(manager);
	const output = structuredClone(data);
	const root = output as unknown as Node;
	if (
		![
			undefined,
			ApplicationCommandType.ChatInput,
			ApplicationCommandType.User,
			ApplicationCommandType.Message,
		].includes(root.type)
	)
		fail(root.name, "Unsupported command type.");
	const context =
		root.type === ApplicationCommandType.User ||
		root.type === ApplicationCommandType.Message;
	validateTree(root, root.name, "root", context);
	const generated = new Map<Node, Set<string>>();
	function visit(
		node: Node,
		selection: CommandLocalisation,
		path: string,
		isContext = false,
	) {
		if (
			typeof selection !== "string" &&
			(!selection || typeof selection !== "object" || Array.isArray(selection))
		)
			fail(path, "Expected a key prefix or localisation object.");
		const config =
			typeof selection === "string"
				? {
						name: `${selection}.name`,
						...(!isContext && { description: `${selection}.description` }),
					}
				: selection;
		if (isContext && (config.description || config.options || config.choices))
			fail(path, "Context menus only support name localisation.");
		for (const field of ["name", "description"] as const) {
			const key = config[field];
			if (key === undefined) continue;
			const mapKey =
				field === "name" ? "name_localizations" : "description_localizations";
			const before = node[mapKey];
			node[mapKey] = fieldLocalizations(
				manager,
				key,
				node[field]!,
				field === "description"
					? "description"
					: isContext
						? "contextName"
						: "slashName",
				before,
				`${path}.${field}`,
				locales,
			);
			if (field === "name")
				generated.set(
					node,
					new Set(
						Object.keys(node[mapKey] ?? {}).filter(
							(locale) => !Object.hasOwn(before ?? {}, locale),
						),
					),
				);
		}
		for (const name of Object.keys(config.options ?? {}))
			if (!node.options?.some((option) => option.name === name))
				fail(path, `Unknown base option "${name}" in translation keys.`);
		for (const option of node.options ?? []) {
			const child =
				typeof selection === "string"
					? `${selection}.options.${option.name}`
					: config.options?.[option.name];
			if (child !== undefined) visit(option, child, `${path}.${option.name}`);
		}
		const choices =
			typeof selection === "string"
				? (node.choices ?? []).map((choice) => ({
						value: choice.value!,
						name: `${selection}.choices.${String(choice.value)}`,
					}))
				: (config.choices ?? []);
		const seen = new Set<Node>();
		for (const choiceKeys of choices) {
			const choice = node.choices?.find(
				(choice) => choice.value === choiceKeys.value,
			);
			if (!choice || seen.has(choice))
				fail(
					path,
					`Unknown or repeated stable choice value "${String(choiceKeys.value)}" in translation keys.`,
				);
			seen.add(choice);
			choice.name_localizations = fieldLocalizations(
				manager,
				choiceKeys.name,
				choice.name,
				"choice",
				choice.name_localizations,
				`${path}.choices[${String(choice.value)}]`,
				locales,
			);
		}
	}
	visit(root, keys, root.name, context);
	function collisions(node: Node, path: string) {
		const siblings = node.options ?? [];
		// Removing a generated translation can expose a regional fallback, so repeat until stable.
		let changed = true;
		while (changed) {
			changed = false;
			for (const locale of discordLocales)
				for (let i = 0; i < siblings.length; i++)
					for (let j = i + 1; j < siblings.length; j++) {
						const a = siblings[i]!,
							b = siblings[j]!;
						const source = (x: Node) =>
							x.name_localizations?.[locale as Locale] != null
								? locale
								: x.name_localizations?.[regionalFallbacks[locale] as Locale] !=
									  null
									? regionalFallbacks[locale]
									: undefined;
						const aLocale = source(a),
							bLocale = source(b);
						const aName = aLocale
								? a.name_localizations![aLocale as Locale]
								: a.name,
							bName = bLocale
								? b.name_localizations![bLocale as Locale]
								: b.name;
						if (aName !== bName && aName !== b.name && bName !== a.name)
							continue;
						const candidates: [Node, string | undefined][] =
							aName === b.name
								? [[a, aLocale]]
								: bName === a.name
									? [[b, bLocale]]
									: [
											[b, bLocale],
											[a, aLocale],
										];
						const removable = candidates.find(
							([n, l]) =>
								l &&
								generated.get(n)?.has(l) &&
								n.name_localizations![l as Locale] !== n.name,
						);
						if (!removable)
							fail(
								path,
								`Conflicting explicit option names for ${locale}: ${a.name}, ${b.name}.`,
							);
						const [n, l] = removable;
						diagnostic(manager, {
							code: "invalid",
							locale: l,
							path: `${path}.${n.name}`,
							message: "Conflicting translated option name omitted.",
						});
						delete n.name_localizations![l as Locale];
						generated.get(n)!.delete(l!);
						changed = true;
					}
		}
		for (const option of siblings) collisions(option, `${path}.${option.name}`);
	}
	collisions(root, root.name);
	if (validateTree(root, root.name, "root", context) > 8000)
		fail(root.name, "Combined command presentation exceeds 8000 characters.");
	return output;
}
