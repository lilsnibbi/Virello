import {
	type APIApplicationCommandOptionChoice,
	ChannelType,
} from "discord-api-types/v10";
import { InteractionContext as BaseInteraction } from "../../discord/InteractionContext";
import { MessageContext as Message } from "../../discord/MessageContext";
import type {
	AppendKeyPrefix,
	DefaultNamespace,
	InterpolationMap,
	Namespace,
	ParseKeys,
	TFunctionReturn,
	TFunctionReturnOptionalDetails,
	TOptions,
} from "i18next";
import { container } from "../../core/modules/index";
import {
	commandLocales,
	commandTranslation,
	fieldLocalizations,
} from "./commands";
import type {
	$Dictionary,
	$SpecialObject,
	BuilderWithDescription,
	BuilderWithName,
	BuilderWithNameAndDescription,
	InternationalizationContext,
	LocalizedData,
	Target,
} from "./types";

/** Get the language name for a specific target, using {@link LocaleManager.fetchLanguage}. */
export function fetchLanguage(target: Target): Promise<string> {
	// Handle Interactions:
	if (target instanceof BaseInteraction) {
		return resolveLanguage({
			user: target.user,
			channel: target.channel,
			guild: target.guild,
			interactionGuildLocale: target.guildLocale,
			interactionLocale: target.locale,
		});
	}

	// Handle Message:
	if (target instanceof Message) {
		return resolveLanguage({
			user: target.author,
			channel: target.channel,
			guild: target.guild,
		});
	}

	// Handle Guild:
	if (!("type" in target)) {
		return resolveLanguage({ user: null, channel: null, guild: target });
	}

	// Handle DMChannel and GroupDMChannel:
	if (target.type === ChannelType.DM || target.type === ChannelType.GroupDM) {
		return resolveLanguage({ user: null, channel: target, guild: null });
	}

	// Handle any other channel:
	const guildId =
		("guild_id" in target ? target.guild_id : undefined) ??
		container.client?.cache.guildForChannel(target.id);
	const guild = guildId
		? { ...container.client?.cache.guilds.get(guildId)?.data, id: guildId }
		: null;
	return resolveLanguage({ user: null, channel: target, guild });
}

/** Get the language-assigned function from i18next designated to a target's preferred language code. */
export async function fetchT(target: Target) {
	return container.i18n.getT(await fetchLanguage(target));
}

/** Resolve a key and its parameters. */
export async function resolveKey<
	const Key extends ParseKeys<Ns, TOpt, undefined>,
	const TOpt extends TOptions = TOptions,
	Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
		TOpt["returnObjects"] extends true ? $SpecialObject : string,
	Ns extends Namespace = DefaultNamespace,
	const ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt &
		InterpolationMap<Ret>,
>(
	target: Target,
	key: Key | Key[],
	options?: ActualOptions,
): Promise<TFunctionReturnOptionalDetails<Ret, TOpt>>;

/** Resolve a key and its parameters. */
export async function resolveKey<
	const Key extends ParseKeys<Ns, TOpt, undefined>,
	const TOpt extends TOptions = TOptions,
	Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
		TOpt["returnObjects"] extends true ? $SpecialObject : string,
	Ns extends Namespace = DefaultNamespace,
	const ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt &
		InterpolationMap<Ret>,
>(
	target: Target,
	key: string | string[],
	options: ActualOptions &
		$Dictionary & {
			/** Fallback text used when the translation key is missing. */
			defaultValue: string;
		},
): Promise<TFunctionReturnOptionalDetails<Ret, TOpt>>;

/** Resolve a key and its parameters. */
export async function resolveKey<
	const Key extends ParseKeys<Ns, TOpt, undefined>,
	const TOpt extends TOptions = TOptions,
	Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
		TOpt["returnObjects"] extends true ? $SpecialObject : string,
	Ns extends Namespace = DefaultNamespace,
	const ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt &
		InterpolationMap<Ret>,
>(
	target: Target,
	key: string | string[],
	defaultValue: string,
	options?: ActualOptions & $Dictionary,
): Promise<TFunctionReturnOptionalDetails<Ret, TOpt>>;

/** Resolve a key and its parameters. */
export async function resolveKey<
	const Key extends ParseKeys<Ns, TOpt, undefined>,
	const TOpt extends TOptions = TOptions,
	Ret extends TFunctionReturn<Ns, AppendKeyPrefix<Key, undefined>, TOpt> =
		TOpt["returnObjects"] extends true ? $SpecialObject : string,
	Ns extends Namespace = DefaultNamespace,
	const ActualOptions extends TOpt & InterpolationMap<Ret> = TOpt &
		InterpolationMap<Ret>,
>(
	target: Target,
	...[key, defaultValueOrOptions, optionsOrUndefined]:
		| [key: Key | Key[], options?: ActualOptions]
		| [
				key: string | string[],
				options: TOpt & $Dictionary & { defaultValue: string },
		  ]
		| [
				key: string | string[],
				defaultValue: string,
				options?: ActualOptions & $Dictionary,
		  ]
): Promise<TFunctionReturnOptionalDetails<Ret, TOpt>> {
	const parsedOptions =
		typeof defaultValueOrOptions === "string"
			? optionsOrUndefined
			: defaultValueOrOptions;
	const language =
		typeof parsedOptions?.lng === "string"
			? parsedOptions.lng
			: await fetchLanguage(target);

	if (typeof defaultValueOrOptions === "string") {
		return container.i18n.format<Key, TOpt, Ns, Ret, ActualOptions>(
			language,
			key,
			defaultValueOrOptions,
			optionsOrUndefined,
		);
	}

	return container.i18n.format<Key, TOpt, Ns, Ret, ActualOptions>(
		language,
		key,
		undefined,
		defaultValueOrOptions,
	);
}

/** @internal */
async function resolveLanguage(
	context: InternationalizationContext,
): Promise<string> {
	const lang = await container.i18n.fetchLanguage(context);
	const preferred =
		lang ??
		context.interactionLocale ??
		context.guild?.preferred_locale ??
		container.i18n.options.defaultName ??
		"en-US";
	return container.i18n.languages.has(preferred)
		? preferred
		: (container.i18n.options.defaultName ?? "en-US");
}

/** Get exact default text and Discord presentation maps from a translation key. */
export function getLocalizedData<
	const TOpt extends TOptions = TOptions,
	Ns extends Namespace = DefaultNamespace,
	KPrefix = undefined,
>(key: ParseKeys<Ns, TOpt, KPrefix>): LocalizedData {
	const manager = container.i18n;
	const locales = commandLocales(manager);
	const locale =
		manager.options.discord?.defaultLocale ??
		manager.options.defaultName ??
		"en-US";
	const value = commandTranslation(manager, locale, key);
	if (typeof value !== "string" || !value.length)
		throw new TypeError(`Missing or non-string default translation: ${key}`);
	return {
		value,
		localizations: fieldLocalizations(
			manager,
			key,
			value,
			"choice",
			undefined,
			key,
			locales,
		)!,
	};
}

/** Localise the name already set on the builder, keeping its operational identifier stable. */
export function applyNameLocalizedBuilder<
	T extends BuilderWithName,
	const TOpt extends TOptions = TOptions,
	Ns extends Namespace = DefaultNamespace,
	KPrefix = undefined,
>(builder: T, key: ParseKeys<Ns, TOpt, KPrefix>): T {
	if (!builder.name)
		throw new TypeError(
			"Set the stable base name before applying name localisation.",
		);
	return builder.setNameLocalizations(
		fieldLocalizations(
			container.i18n,
			key,
			builder.name,
			"slashName",
			builder.name_localizations,
			key,
		),
	);
}

/** Localise a description; an unset base description uses the exact default-language text. */
export function applyDescriptionLocalizedBuilder<
	T extends BuilderWithDescription,
	const TOpt extends TOptions = TOptions,
	Ns extends Namespace = DefaultNamespace,
	KPrefix = undefined,
>(builder: T, key: ParseKeys<Ns, TOpt, KPrefix>): T {
	const base = builder.description ?? getLocalizedData(key).value;
	return builder
		.setDescription(base)
		.setDescriptionLocalizations(
			fieldLocalizations(
				container.i18n,
				key,
				base,
				"description",
				builder.description_localizations,
				key,
			),
		);
}

/** Legacy root suffixes Name/Description remain supported; base names must be set first. */
export function applyLocalizedBuilder<
	T extends BuilderWithNameAndDescription,
	const TOpt extends TOptions = TOptions,
	Ns extends Namespace = DefaultNamespace,
	KPrefix = undefined,
>(
	builder: T,
	...params:
		| [root: string]
		| [
				name: ParseKeys<Ns, TOpt, KPrefix>,
				description: ParseKeys<Ns, TOpt, KPrefix>,
		  ]
): T {
	type Key = ParseKeys<Ns, TOpt, KPrefix>;
	const [name, description] =
		params.length === 1
			? [`${params[0]}Name` as Key, `${params[0]}Description` as Key]
			: params;
	applyNameLocalizedBuilder(builder, name);
	applyDescriptionLocalizedBuilder(builder, description);
	return builder;
}

/** Localise a choice label, retaining the caller's exact value and explicit localisations. */
export function createLocalizedChoice<
	ValueType = string | number,
	const TOpt extends TOptions = TOptions,
	Ns extends Namespace = DefaultNamespace,
	KPrefix = undefined,
>(
	key: ParseKeys<Ns, TOpt, KPrefix>,
	options: Omit<APIApplicationCommandOptionChoice<ValueType>, "name"> & {
		/** Optional stable base display name. Defaults to the key’s text in the default presentation locale. */
		name?: string;
	},
): APIApplicationCommandOptionChoice<ValueType> {
	const base = options.name ?? getLocalizedData(key).value;
	return {
		...options,
		name: base,
		name_localizations: fieldLocalizations(
			container.i18n,
			key,
			base,
			"choice",
			options.name_localizations,
			key,
		),
	};
}
