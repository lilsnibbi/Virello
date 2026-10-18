import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { type Awaitable } from "../../utilities/index";
import { MissingModuleError } from "../errors/MissingModuleError";
import type { Module } from "../modules/Module";
import type { ModuleStore } from "../modules/ModuleStore";
import type {
	AsyncPreloadResult,
	FilterResult,
	HydratedModuleData,
	ILoaderResult,
	ILoaderResultEntry,
	ModuleData,
	ModuleLoaderHooks,
} from "./contracts";
import { isModuleFile } from "./ModuleGlob";
import { classExtends, isClass } from "./Shared";

/** Import raw TypeScript modules with Bun. */
export class ModuleLoader<T extends Module> implements ModuleLoaderHooks<T> {
	/** File extensions accepted by filter. Defaults to .ts. */
	public readonly supportedExtensions = [".ts"];

	/**
	 * Read a candidate file’s name and extension, or skip unsupported, hidden, and declaration files.
	 * @param path - Candidate file path.
	 * @returns File metadata, or null when skipped.
	 */
	public filter(path: string): FilterResult {
		if (!isModuleFile(path)) return null;
		// Retrieve the file extension.
		const extension = extname(path);
		if (!this.supportedExtensions.includes(extension)) return null;

		// Retrieve the name of the file, return null if empty.
		const name = basename(path, extension);
		if (name === "") return null;

		// Return the name and extension.
		return { extension, path, name };
	}

	/**
	 * Import a module file, reusing the supplied import cache when available.
	 * @param file - File metadata.
	 * @returns The imported exports.
	 * @throws If Bun cannot import the file.
	 */
	public async preload(file: ModuleData): AsyncPreloadResult<T> {
		// Share an import when one file supplies several module kinds.
		const cached = file.imports?.get(file.path);
		if (cached) return cached;
		const imported = import(pathToFileURL(file.path).href);
		file.imports?.set(file.path, imported);
		return imported;
	}

	/**
	 * Yield distinct compatible class exports in export-name order.
	 * @param store - Store that defines the required base class.
	 * @param file - File metadata and root directory.
	 * @returns An async iterator of module classes.
	 * @throws MissingModuleError if no compatible class exists, or the import error if loading fails.
	 */
	public async *load(
		store: ModuleStore<T>,
		file: HydratedModuleData,
	): ILoaderResult<T> {
		let yielded = false;
		const result = await this.preload(file);

		// Load each exported module class:
		for (const value of new Set(
			Object.keys(result)
				.sort()
				.map((key) => Reflect.get(result, key) as unknown),
		)) {
			if (isClass(value) && classExtends(value, store.Constructor)) {
				yield value as ILoaderResultEntry<T>;
				yielded = true;
			}
		}

		if (!yielded) {
			throw new MissingModuleError(file.path);
		}
	}

	/** Hook awaited before the module’s onLoad and insertion. The default does nothing. */
	public onLoad(store: ModuleStore<T>, module: T): Awaitable<unknown>;
	/** Hook awaited before the module’s onLoad and insertion. The default does nothing. */
	public onLoad(): unknown {
		return undefined;
	}

	/** Hook awaited after a store finishes activating its candidates. The default does nothing. */
	public onLoadAll(store: ModuleStore<T>): Awaitable<unknown>;
	/** Hook awaited after a store finishes activating its candidates. The default does nothing. */
	public onLoadAll(): unknown {
		return undefined;
	}

	/** Hook awaited before the module’s onUnload and removal. The default does nothing. */
	public onUnload(store: ModuleStore<T>, module: T): Awaitable<unknown>;
	/** Hook awaited before the module’s onUnload and removal. The default does nothing. */
	public onUnload(): unknown {
		return undefined;
	}

	/** Hook awaited after every module cleanup has been attempted. The default does nothing. */
	public onUnloadAll(store: ModuleStore<T>): Awaitable<unknown>;
	/** Hook awaited after every module cleanup has been attempted. The default does nothing. */
	public onUnloadAll(): unknown {
		return undefined;
	}
}
