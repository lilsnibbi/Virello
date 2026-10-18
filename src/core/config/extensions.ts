import { LocaleExtension } from "../../extensions/localisation/extension";
import type { InternationalizationOptions } from "../../extensions/localisation/types";
import { PatternExtension } from "../../extensions/patternCommands/extension";
import { TasksExtension } from "../../extensions/scheduledTasks/extension";
import type { TaskSchedulerOptions } from "../../extensions/scheduledTasks/types/TaskTypes";
import { ServicesExtension } from "../../extensions/services/extension";
import { SubcommandsExtension } from "../../extensions/subcommands/extension";
import type { CooldownOptions } from "../client/VirelloClient";
import { Extension } from "../lifecycle/Extension";

/** Settings for subcommand handling. */
export interface SubcommandsOptions {
	/** Register the built-in subcommand error listeners. Defaults to true. */
	logErrors?: boolean;
	/** Default cooldown settings for subcommands. Individual subcommands can override them. */
	defaultCooldown?: CooldownOptions;
}

/** Built-ins are available by default. Pass false to turn one off. */
export interface ExtensionOptions {
	/** Configure locale loading and translation helpers, or false to disable them. Enabled by default. */
	localisation?: false | InternationalizationOptions;
	/** Configure the task scheduler, or false to disable it. Enabled with an in-memory backend by default. */
	scheduledtasks?: false | TaskSchedulerOptions;
	/** Enable regex message commands with an empty object, or disable them with false. Enabled by default. */
	patternCommands?: false | Record<string, never>;
	/** Configure subcommand dispatch and error listeners, or false to disable the extension. Enabled by default. */
	subcommands?: false | SubcommandsOptions;
	/** Enable service modules with an empty object, or disable them with false. Enabled by default. */
	services?: false | Record<string, never>;
	/** Custom classes run after built-ins, once each, in this order. */
	custom?: readonly (typeof Extension)[];
}

export const builtInExtensions = {
	localisation: LocaleExtension,
	scheduledtasks: TasksExtension,
	patternCommands: PatternExtension,
	subcommands: SubcommandsExtension,
	services: ServicesExtension,
} as const;

export function resolveExtensions(
	options: ExtensionOptions = {},
): readonly (typeof Extension)[] {
	if (!options || typeof options !== "object" || Array.isArray(options))
		throw new TypeError(
			"Use extensions: { localisation: {}, scheduledtasks: {}, custom: [YourExtension] }.",
		);
	for (const [key, value] of Object.entries(options)) {
		if (key === "custom") continue;
		if (!(key in builtInExtensions))
			throw new TypeError(`Unknown built-in extension "${key}".`);
		if (
			value !== undefined &&
			value !== false &&
			(value === null || typeof value !== "object" || Array.isArray(value))
		)
			throw new TypeError(
				`extensions.${key} must be false or an options object.`,
			);
	}
	if (options.custom !== undefined && !Array.isArray(options.custom))
		throw new TypeError("extensions.custom must be an array.");
	const builtins = new Set<typeof Extension>(Object.values(builtInExtensions));
	for (const extension of options.custom ?? []) {
		if (
			typeof extension !== "function" ||
			!(extension.prototype instanceof Extension)
		)
			throw new TypeError("Custom extensions must extend Extension.");
		if (builtins.has(extension))
			throw new TypeError(
				"Configure built-in extensions by name, not in extensions.custom.",
			);
	}
	return Object.freeze([
		...new Set([
			...Object.entries(builtInExtensions)
				.filter(
					([key]) => options[key as keyof typeof builtInExtensions] !== false,
				)
				.map(([, value]) => value),
			...(options.custom ?? []),
		]),
	]);
}
