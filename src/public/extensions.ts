/**
 * Configure built-in features or add a feature through static client lifecycle hooks.
 * @packageDocumentation
 */
import "../core/runtime";

export type {
	ExtensionOptions,
	SubcommandsOptions,
} from "../core/config/extensions";
export * from "../core/lifecycle/Extension";
export { LocaleExtension } from "../extensions/localisation/extension";
export { PatternExtension } from "../extensions/patternCommands/extension";
export { TasksExtension } from "../extensions/scheduledTasks/extension";
export { ServicesExtension } from "../extensions/services/extension";
export { SubcommandsExtension } from "../extensions/subcommands/extension";
