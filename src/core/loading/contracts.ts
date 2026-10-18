import type { Awaitable, Constructor, Ctor } from "../../utilities/index";
import type { Module } from "../modules/Module";
import type { ModuleStore } from "../modules/ModuleStore";

/** The module data information. */
export interface ModuleData {
	/** Optional per-startup cache of import promises, keyed by absolute file path. */
	imports?: Map<string, Promise<Record<string, unknown>>>;
	/** The name of the module. */
	name: string;

	/** The absolute path to the module. */
	path: string;

	/** The extension of the module. */
	extension: string;
}

/** The hydrated module data. */
export interface HydratedModuleData extends ModuleData {
	/** The directory the module was loaded from. */
	root: string;
}

/** The result from the filter. */
export type FilterResult = ModuleData | null;

/** The return data from {@link ModuleLoaderHooks.preload} */
export type PreloadResult<T extends Module> = Awaitable<
	Record<PropertyKey, unknown> | Constructor<T>
>;

/** The return data from {@link ModuleLoaderHooks.preload} */
export type AsyncPreloadResult<T extends Module> = Promise<
	Record<PropertyKey, unknown> | Constructor<T>
>;

/** An entry from {@link ILoaderResult}. */
export type ILoaderResultEntry<T extends Module> = Ctor<
	ConstructorParameters<typeof Module>,
	T
>;

/** The return data from {@link ModuleLoaderHooks.load}. */
export type ILoaderResult<T extends Module> = AsyncIterableIterator<
	ILoaderResultEntry<T>
>;

/** An abstracted loader strategy interface. */
export interface ModuleLoaderHooks<T extends Module> {
	/** Get the name and the extension of the specified file path. */
	filter(path: string): FilterResult;

	/** The pre-load hook, use this to override the loader. */
	preload(file: ModuleData): PreloadResult<T>;

	/** The load hook, use this to override the loader. */
	load(store: ModuleStore<T>, file: HydratedModuleData): ILoaderResult<T>;

	/** Called after a module has been loaded, but before {@link Module.onLoad} and {@link ModuleStore.set}. */
	onLoad(store: ModuleStore<T>, module: T): Awaitable<unknown>;

	/** Called after all pieces have been loaded. */
	onLoadAll(store: ModuleStore<T>): Awaitable<unknown>;

	/** Run before the module’s onUnload and removal, including cleanup after failed activation. Its result is awaited and ignored. */
	onUnload(store: ModuleStore<T>, module: T): Awaitable<unknown>;

	/** Run after every module cleanup has been attempted. Its result is awaited and ignored. */
	onUnloadAll(store: ModuleStore<T>): Awaitable<unknown>;
}
