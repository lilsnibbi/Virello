import type { PathLike } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import i18next, {
	type AppendKeyPrefix,
	type DefaultNamespace,
	type InterpolationMap,
	type Namespace,
	type ParseKeys,
	type Resource,
	type TFunction,
	type TFunctionProcessReturnValue,
	type TFunctionReturn,
	type TFunctionReturnOptionalDetails,
	type TOptions,
} from "i18next";
import { moduleRoot } from "../../core/loading/ModuleGlob";
import { fallbackLogger } from "../../core/logging/console";
import { writeEvent } from "../../core/logging/diagnostics";
import { container } from "../../core/modules/index";
import { type Awaitable, isFunction } from "../../utilities/index";
import { discordLocales, localizeCommand } from "./commands";
import { loadResources, resourceBundle, scanResources } from "./resources";
import type {
	$Dictionary,
	$NoInfer,
	$SpecialObject,
	CommandLocalisation,
	InternationalizationContext,
	InternationalizationOptions,
	LocalisationDiagnostic,
} from "./types";

/** Startup-only JSON resources and an isolated i18next engine. */
export class LocaleManager {
	/** Whether startup resources and formatters finished initializing. */
	public languagesLoaded = false;
	private initialization?: Promise<void>;
	/** Namespace names discovered in loaded resources. */
	public namespaces = new Set<string>();
	/** Loaded language codes and their fixed i18next translation functions. */
	public readonly languages = new Map<string, TFunction>();
	/** i18next instance owned by this manager. */
	public readonly instance = i18next.createInstance();
	/** Resource and command-localization diagnostics accumulated by report(). */
	public readonly diagnostics: LocalisationDiagnostic[] = [];
	/** Original locale settings supplied to the manager. */
	public readonly options: InternationalizationOptions;
	/** Absolute primary language directory, resolved against the active client’s module root. */
	public readonly languagesDirectory: string;
	private readonly directories: { path: string; optional: boolean }[];

	/**
	 * Configure startup resources without scanning them yet.
	 * @param options - Locale directories, i18next settings, and Discord presentation rules.
	 * @throws For removed backend/HMR options, invalid paths, or unsupported Discord locale settings.
	 */
	public constructor(options: InternationalizationOptions = {}) {
		this.options = options;
		if ("hmr" in options)
			throw new TypeError(
				"Translation HMR was removed. Restart the process after changing translations.",
			);
		if ("backend" in options)
			throw new TypeError(
				"Translation backend options were removed. Use resourceDirectories or i18next.resources.",
			);
		const root = moduleRoot(container.client?.options.root);
		const paths = [
			options.defaultLanguageDirectory ?? "languages",
			...(options.resourceDirectories ?? []),
		];
		if (!Array.isArray(options.resourceDirectories ?? []))
			throw new TypeError(
				"resourceDirectories must be an array of directories.",
			);
		if (
			paths.some(
				(path) =>
					typeof path !== "string" || !path.trim() || path.includes("\0"),
			)
		)
			throw new TypeError("Translation directories must be non-empty paths.");
		this.languagesDirectory = resolve(root, paths[0]!);
		this.directories = [
			...new Set(paths.map((path) => resolve(root, path))),
		].map((path, index) => ({
			path,
			optional: index === 0 && options.defaultLanguageDirectory === undefined,
		}));
		if (
			options.defaultName !== undefined &&
			(typeof options.defaultName !== "string" || !options.defaultName.trim())
		)
			throw new TypeError("defaultName must be a language code.");
		if (
			options.discord?.defaultLocale !== undefined &&
			!discordLocales.has(options.discord.defaultLocale)
		)
			throw new TypeError(
				"discord.defaultLocale must be a supported Discord locale.",
			);
		if (
			options.discord?.locales !== undefined &&
			(!Array.isArray(options.discord.locales) ||
				options.discord.locales.some((locale) => !discordLocales.has(locale)))
		)
			throw new TypeError(
				"discord.locales must contain supported Discord locale identifiers.",
			);
		if (isFunction(options.fetchLanguage))
			this.fetchLanguage = options.fetchLanguage;
	}

	/** Custom language hook. Defaults to returning null so invocation locale, guild preference, and defaultName can select the language. */
	public fetchLanguage: (
		context: InternationalizationContext,
	) => Awaitable<string | null> = () => null;
	/**
	 * Load startup resources and initialize i18next once. Bad file resources are reported and skipped; inline resources
	 * replace matching file namespaces.
	 * @returns One shared initialization promise.
	 * @throws For invalid inline resources, unsupported i18next backends/resource writes, initialization failures, or thrown
	 * diagnostic callbacks.
	 */
	public init(): Promise<void> {
		this.initialization ??= this.initialize();
		return this.initialization;
	}

	private async initialize(): Promise<void> {
		const resources = await loadResources(this.directories, (diagnostic) =>
			this.report(diagnostic),
		);
		const foundLanguages = Object.keys(resources);
		const foundNamespaces = [
			...new Set(
				Object.values(resources).flatMap((language) => Object.keys(language)),
			),
		];
		const user =
			(isFunction(this.options.i18next)
				? this.options.i18next(foundNamespaces, foundLanguages)
				: this.options.i18next) ?? {};
		if (
			user.backend !== undefined ||
			user.partialBundledLanguages ||
			user.saveMissing ||
			user.updateMissing
		)
			throw new TypeError(
				"LocaleManager only loads startup resources; backends and resource writes are unsupported.",
			);
		const inline = resourceBundle(user.resources ?? {}) as Resource;
		for (const [locale, namespaces] of Object.entries(inline)) {
			const bundles = resourceBundle(namespaces);
			const language = (resources[locale] ??= Object.create(null));
			for (const [namespace, bundle] of Object.entries(bundles))
				language[namespace] = resourceBundle(bundle);
		}
		const namespaces = [
			...new Set([
				...foundNamespaces,
				...Object.values(resources).flatMap((language) =>
					Object.keys(language),
				),
			]),
		];
		const languages = [
			...new Set([
				...Object.keys(resources),
				this.options.defaultName ?? "en-US",
			]),
		];
		await this.instance.init({
			fallbackLng: this.options.defaultName ?? "en-US",
			load: "all",
			defaultNS: this.options.defaultNS ?? "default",
			ns: namespaces,
			...user,
			interpolation: {
				escapeValue: false,
				...user.interpolation,
				skipOnVariables: user.interpolation?.skipOnVariables ?? false,
			},
			ignoreJSONStructure: user.ignoreJSONStructure ?? false,
			resources: resources as Resource,
			initAsync: false,
		});
		for (const formatter of this.options.formatters ?? []) {
			if (formatter.cached)
				this.instance.services.formatter!.addCached(
					formatter.name,
					formatter.format,
				);
			else
				this.instance.services.formatter!.add(formatter.name, formatter.format);
		}
		this.namespaces = new Set(namespaces);
		for (const language of languages)
			this.languages.set(language, this.instance.getFixedT(language));
		this.languagesLoaded = true;
	}

	/**
	 * Get the fixed translation function for a loaded language.
	 * @param locale - Loaded language code.
	 * @returns Its i18next translator.
	 * @throws Before init completes or when the language is not loaded.
	 */
	public getT(locale: string) {
		if (!this.languagesLoaded)
			throw new Error(
				"Cannot call this method until LocaleManager#init has been called",
			);
		const t = this.languages.get(locale);
		if (!t) throw new ReferenceError("Invalid language provided");
		return t;
	}

	/** Build Discord presentation maps without changing base names, values or the input object. */
	public localizeCommand<T extends RESTPostAPIApplicationCommandsJSONBody>(
		data: T,
		keys: CommandLocalisation,
	): T &
		Pick<
			RESTPostAPIApplicationCommandsJSONBody,
			"name_localizations" | "description_localizations"
		> {
		return localizeCommand(this, data, keys);
	}

	/** @internal Reports a recoverable resource or presentation problem with its source. */
	public report(diagnostic: LocalisationDiagnostic): void {
		this.diagnostics.push(diagnostic);
		if (this.options.onDiagnostic) {
			this.options.onDiagnostic(diagnostic);
			return;
		}
		const messages: Record<LocalisationDiagnostic["code"], string> = {
			resource:
				"Translation resource could not load; check its path, JSON syntax and file permissions.",
			duplicate:
				"Ignored a duplicate translation resource; the first locale/namespace definition wins.",
			unsupportedLocale:
				"Skipped a locale that Discord does not support; configure a Discord locale code.",
			missing:
				"Command translation is missing; add the named key or check the configured fallback locale.",
			invalid:
				"Command translation is invalid; check field length, static text and option-name uniqueness.",
		};
		writeEvent(container.logger ?? fallbackLogger(), "alert", {
			component: "localisation",
			event: "diagnostic",
			message: messages[diagnostic.code],
			error: diagnostic.cause,
			context: {
				code: diagnostic.code,
				path: diagnostic.path,
				locale: diagnostic.locale,
				namespace: diagnostic.namespace,
				key: diagnostic.key,
				strict: this.options.discord?.strict ?? false,
			},
		});
	}

	/** Localizes a content given one or more keys and i18next options. */
	public format<
		const Key extends ParseKeys<Ns, TOpt, undefined>,
		const TOpt extends TOptions = TOptions,
		Ns extends Namespace = DefaultNamespace,
		Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
			TOpt["returnObjects"] extends true ? $SpecialObject : string,
		const ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt &
			InterpolationMap<Ret>,
	>(
		locale: string,
		key: Key | Key[],
		options?: ActualOptions,
	): TFunctionReturnOptionalDetails<Ret, TOpt>;

	/** Localizes a content given one or more keys and i18next options. */
	public format<
		const Key extends ParseKeys<Ns, TOpt, undefined>,
		const TOpt extends TOptions = TOptions,
		Ns extends Namespace = DefaultNamespace,
		Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
			TOpt["returnObjects"] extends true ? $SpecialObject : string,
		const _ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt &
			InterpolationMap<Ret>,
	>(
		locale: string,
		key: string | string[],
		options: TOpt &
			$Dictionary & {
				/** Fallback text used when no translation is found. */
				defaultValue: string;
			},
	): TFunctionReturnOptionalDetails<Ret, TOpt>;

	/** Localizes a content given one or more keys and i18next options. */
	public format<
		const Key extends ParseKeys<Ns, TOpt, undefined>,
		const TOpt extends TOptions = TOptions,
		Ns extends Namespace = DefaultNamespace,
		Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
			TOpt["returnObjects"] extends true ? $SpecialObject : string,
		const _ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt &
			InterpolationMap<Ret>,
	>(
		locale: string,
		key: string | string[],
		defaultValue: string | undefined,
		options?: TOpt & $Dictionary,
	): TFunctionReturnOptionalDetails<Ret, TOpt>;

	/** Localizes a content given one or more keys and i18next options. */
	public format<
		const Key extends ParseKeys<Ns, TOpt, undefined>,
		const TOpt extends TOptions = TOptions,
		Ns extends Namespace = DefaultNamespace,
		Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
			TOpt["returnObjects"] extends true ? $SpecialObject : string,
		const ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt &
			InterpolationMap<Ret>,
		DefaultValue extends string = never,
	>(
		locale: string,
		...[key, defaultValueOrOptions, optionsOrUndefined]:
			| [key: Key | Key[], options?: ActualOptions]
			| [
					key: string | string[],
					options: TOpt & $Dictionary & { defaultValue: string },
			  ]
			| [
					key: string | string[],
					defaultValue: DefaultValue | undefined,
					options?: TOpt & $Dictionary,
			  ]
	): TFunctionReturnOptionalDetails<
		TFunctionProcessReturnValue<$NoInfer<Ret>, DefaultValue>,
		TOpt
	> {
		if (!this.languagesLoaded)
			throw new Error(
				"Cannot call this method until LocaleManager#init has been called",
			);

		const language = this.languages.get(locale);
		if (!language) throw new ReferenceError("Invalid language provided");

		const defaultValue =
			typeof defaultValueOrOptions === "string"
				? defaultValueOrOptions
				: this.options.defaultMissingKey
					? language(this.options.defaultMissingKey, { replace: { key } })
					: "";

		const actualOptions =
			typeof defaultValueOrOptions === "object"
				? defaultValueOrOptions
				: optionsOrUndefined;
		return Reflect.apply(language, undefined, [
			key,
			{
				defaultValue,
				...actualOptions,
			},
		]) as TFunctionReturnOptionalDetails<
			TFunctionProcessReturnValue<$NoInfer<Ret>, DefaultValue>,
			TOpt
		>;
	}

	/**
	 * Scan a resource directory without adding it to the manager.
	 * @param directory - Resource root with language subdirectories and JSON namespace files.
	 * @returns Discovered language codes and namespace names.
	 * @throws If the directory cannot be scanned.
	 */
	public async walkRootDirectory(directory: PathLike) {
		const path =
			directory instanceof URL
				? fileURLToPath(directory)
				: directory.toString();
		const files = await scanResources(path);
		return {
			languages: [...new Set(files.map((file) => file.locale))],
			namespaces: [...new Set(files.map((file) => file.namespace))],
		};
	}
}
