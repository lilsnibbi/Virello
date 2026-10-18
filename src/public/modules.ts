/**
 * Define, register, load, and unload framework modules and stores.
 * @packageDocumentation
 */
import "../core/runtime";

export type { ModulePatterns } from "../core/loading/ModuleGlob";
export { ModuleLoader } from "../core/loading/ModuleLoader";
export {
	AliasModule,
	type AliasModuleJSON,
	type AliasModuleOptions,
	AliasModuleStore,
	MissingModuleError,
	Module,
	type ModuleContext,
	type ModuleJSON,
	type ModuleKind,
	ModuleLoadError,
	type ModuleLocationJSON,
	type ModuleOf,
	type ModuleOptions,
	type ModuleRegistration,
	ModuleRegistry,
	ModuleStore,
	type ModuleStoreOptions,
	type ModuleStores,
	type ModuleStoreValue,
	type RegistryModuleRegistration,
	type StoreFor,
} from "../core/modules/index";
export type { ModulePaths } from "../core/modules/ModuleRegistry";
