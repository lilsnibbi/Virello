// Adapted from Ovencord (cc6100f8), Apache-2.0.
// Modified for Virello: local utilities, native payloads and validated serialization.
// See src/builders/NOTICE and src/builders/LICENSE.
import type {
	Locale,
	RESTPostAPIApplicationCommandsJSONBody,
} from "discord-api-types/v10";

export type SharedNameData = Partial<
	Pick<RESTPostAPIApplicationCommandsJSONBody, "name_localizations" | "name">
>;

/**
 * This mixin holds name and description symbols for chat input commands.
 */
export class SharedName {
	/**
	 * @internal
	 */
	protected readonly data: SharedNameData = {};

	/**
	 * Sets the name of this command.
	 *
	 * @param name - The name to use
	 */
	public setName(name: string): this {
		this.data.name = name;
		return this;
	}

	/**
	 * Returns the name of this command.
	 */
	public get name(): string | undefined {
		return this.data.name;
	}

	/** Snapshot of explicitly configured native name localizations. */
	public get name_localizations() {
		return structuredClone(this.data.name_localizations);
	}

	/**
	 * Sets a name localization for this command.
	 *
	 * @param locale - The locale to set
	 * @param localizedName - The localized name for the given `locale`
	 */
	public setNameLocalization(locale: Locale, localizedName: string | null) {
		this.data.name_localizations ??= {};
		this.data.name_localizations[locale] = localizedName ?? undefined;

		return this;
	}

	/**
	 * Clears a name localization for this command.
	 *
	 * @param locale - The locale to clear
	 */
	public clearNameLocalization(locale: Locale) {
		this.data.name_localizations ??= {};
		this.data.name_localizations[locale] = undefined;

		return this;
	}

	/**
	 * Sets the name localizations for this command.
	 *
	 * @param localizedNames - The object of localized names to set
	 */
	public setNameLocalizations(
		localizedNames: Partial<Record<Locale, string>> | null,
	) {
		this.data.name_localizations = structuredClone(localizedNames);
		return this;
	}

	/**
	 * Clears all name localizations for this command.
	 */
	public clearNameLocalizations() {
		this.data.name_localizations = undefined;
		return this;
	}
}
