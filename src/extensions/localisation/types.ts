import type {
	APIChannel,
	APIGuild,
	Locale,
	LocalizationMap,
	APIUser as User,
} from "discord-api-types/v10";
import type {
	InteractionContext as BaseInteraction,
	InteractionContext as Interaction,
} from "../../discord/InteractionContext";
import type { MessageContext as Message } from "../../discord/MessageContext";
import type { GuildReference } from "../../discord/entities";
import type { $Patch } from "../../engine/cache/types";
type Guild = $Patch<APIGuild> & GuildReference;
import type { InitOptions } from "i18next";
import type { Awaitable } from "../../utilities/index";

/** Compatibility type used to control translation return-type inference. */
export type $NoInfer<A> = [A][A extends unknown ? 0 : never];

/** String-keyed values used in translation options and object results. */
export interface $Dictionary {
	/** Application-defined translation or interpolation value by string key. */
	[key: string]: unknown;
}

/** Object or object-array translation result when returnObjects is enabled. */
export type $SpecialObject = $Dictionary | Array<string | $Dictionary>;

/** Build i18next settings from discovered namespaces and language codes. Return startup options synchronously. */
export type DynamicOptions<T extends InitOptions> = (
	namespaces: string[],
	languages: string[],
) => T;

/** The options used in {@link LocaleManager}. */
export interface InternationalizationOptions {
	/**
	 * Default response language, initially en-US. For Discord presentation, supply a supported defaultLocale if this language
	 * is not a Discord locale.
	 */
	defaultName?: string;

	/** Additional resource roots, relative to the client root. Each contains locale/namespace.json. First valid namespace wins. */
	resourceDirectories?: readonly string[];
	/** Discord presentation settings. Missing/invalid generated entries warn and fall back unless strict is true. */
	discord?: {
		/** Discord locales to generate. Omit to use supported loaded locales. */
		locales?: readonly Locale[];
		/** Base locale for Discord presentation. Defaults to defaultName or en-US and must be a supported Discord locale. */
		defaultLocale?: Locale;
		/** Throw for invalid or missing command translations when true. Defaults to false, which reports diagnostics and skips invalid fields. */
		strict?: boolean;
	};
	/**
	 * Receive resource and presentation diagnostics instead of framework logging. The callback runs synchronously; thrown
	 * errors propagate.
	 */
	onDiagnostic?: (diagnostic: LocalisationDiagnostic) => void;

	/** The options passed to `i18next.init`. */
	i18next?: InitOptions | DynamicOptions<InitOptions>;

	/** Primary resource root, relative to the client root; defaults to root/languages. */
	defaultLanguageDirectory?: string;

	/**
	 * Optional translation key whose text formats missing response keys, with key in its replacement data. Omitted settings
	 * fall back to an empty string.
	 */
	defaultMissingKey?: string;

	/** The default NS that is prefixed to all keys that don't specify it. Defaults to "default". */
	defaultNS?: string;

	/** Array of formatters to add to i18n.
	 * @default [] */
	formatters?: I18nextFormatter[];

	/**
	 * Custom language selector. Defaults to returning null, then helpers use interaction locale, guild preference, and
	 * defaultName. Unloaded languages fall back to defaultName or en-US.
	 */
	fetchLanguage?: (
		context: InternationalizationContext,
	) => Awaitable<string | null>;
}

/** Text-capable channel type used by a Discord message. */
export type TextBasedDiscordChannel =
	APIChannel | NonNullable<Interaction["channel"]>;
/** Message text channel, stage channel, or voice channel accepted as a locale context. */
export type DiscordChannel = TextBasedDiscordChannel;

/** Context for {@link LocaleManager.fetchLanguage} functions. This context enables implementation of per-guild, per-channel, and per-user localization. */
export interface InternationalizationContext {
	/** The {@link Guild} object to fetch the preferred language for, or `null` if the language is to be fetched in a DM. */
	guild: Guild | null;
	/** The {@link DiscordChannel} object to fetch the preferred language for. */
	channel: DiscordChannel | null;
	/** The user to fetch the preferred language for. */
	user: User | null;
	/** Guild locale from an interaction, when available. Passed to the custom language hook. */
	interactionGuildLocale?: Interaction["guildLocale"];
	/** User locale from an interaction, used after the custom hook returns null. */
	interactionLocale?: Interaction["locale"];
}

/** @deprecated Use {@link I18nextFormatter} instead */
export type I18nextFormatters = I18nextNamedFormatter;

/** A formatter that is added to i18next with `i18next.services.formatter.add` or `i18next.services.formatter.addCached`, depending on the `cached` property. */
export type I18nextFormatter =
	I18nextNamedFormatter | I18nextNamedCachedFormatter;

/** A cached formatter that is added to i18next with `i18next.services.formatter.add`. */
export interface I18nextNamedFormatter {
	/** Use an uncached formatter when false or omitted. */
	cached?: false;
	/** Name referenced by i18next formatting expressions. */
	name: string;
	/**
	 * Format a value synchronously for the supplied language and options.
	 * @returns Formatted text.
	 */
	format(value: unknown, lng: string | undefined, options: unknown): string;
}

/** A cached formatter that is added to i18next with `i18next.services.formatter.addCached`. */
export interface I18nextNamedCachedFormatter {
	/** Use an i18next cached formatter factory. */
	cached: true;
	/** Name referenced by i18next formatting expressions. */
	name: string;
	/**
	 * Build a formatter for one language/options combination.
	 * @returns A function that turns each value into formatted text.
	 */
	format(lng: string | undefined, options: unknown): (value: unknown) => string;
}

/** Base presentation text and its Discord locale map. */
export interface LocalizedData {
	/** Text in the configured default presentation locale. */
	value: string;
	/** Validated Discord locale variants of the text. */
	localizations: LocalizationMap;
}

/** Builder members needed to apply Discord name localizations. */
export interface BuilderWithName {
	/** Stable base name already set on the builder, when available. */
	readonly name?: string;
	/** Existing localized names, when supplied. */
	readonly name_localizations?: LocalizationMap | null;
	/** Set the stable base name and return this builder. */
	setName(name: string): this;
	/** Set localized names, or clear them with null, and return this builder. */
	setNameLocalizations(localizedNames: LocalizationMap | null): this;
}

/** Builder members needed to apply Discord description localizations. */
export interface BuilderWithDescription {
	/** Base description already set on the builder, when available. */
	readonly description?: string;
	/** Existing localized descriptions, when supplied. */
	readonly description_localizations?: LocalizationMap | null;
	/** Set the base description and return this builder. */
	setDescription(description: string): this;
	/** Set localized descriptions, or clear them with null, and return this builder. */
	setDescriptionLocalizations(
		localizedDescriptions: LocalizationMap | null,
	): this;
}

/** Builder supporting both name and description localization. */
export type BuilderWithNameAndDescription = BuilderWithName &
	BuilderWithDescription;
/** Message or channel used to select a translation language. */
export type ChannelTarget = Message | DiscordChannel;
/** Interaction, message, channel, or guild used to select a translation language. */
export type Target = BaseInteraction | ChannelTarget | Guild;

/** Translation keys only; operational names and choice values always come from the command payload. */
export type CommandLocalisation =
	| string
	| {
			/** Translation key for the display name. Stable base names are preserved. */
			name?: string;
			/** Translation key for the display description. */
			description?: string;
			/** Keyed by the base option/subcommand/group name. A string expands to .name and .description recursively. */
			options?: Readonly<Record<string, CommandLocalisation>>;
			/** Match choices by exact value and type, never by translated label or array position. */
			choices?: readonly {
				/** Stable choice value used to match the original choice; it is never translated. */
				value: string | number;
				/** Translation key for this choice’s display name. */
				name: string;
			}[];
	  };

/** Structured translation loading or command-presentation issue. */
export interface LocalisationDiagnostic {
	/** Issue category: resource loading, duplicate resource, unsupported locale, missing key, or invalid text. */
	code: "resource" | "duplicate" | "unsupportedLocale" | "missing" | "invalid";
	/** Readable explanation of the issue. */
	message: string;
	/** Resource path associated with the issue, when known. */
	path?: string;
	/** Affected language or Discord locale, when known. */
	locale?: string;
	/** Affected translation namespace, when known. */
	namespace?: string;
	/** Affected translation key, when known. */
	key?: string;
	/** Underlying thrown value, when available. */
	cause?: unknown;
}
