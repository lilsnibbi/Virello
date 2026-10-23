import {
	type AbstractConstructor,
	type Constructor,
	classExtends,
	isClass,
} from "@virello/util/general";
import { type Container, container } from "../Container";
import { ModuleCleanupError } from "../errors/ModuleCleanupError";
import {
	ModuleLoadError,
	ModuleLoadErrorType,
} from "../errors/ModuleLoadError";
import { RegisteredModules, VirtualPath } from "../loading/constants";
import type {
	HydratedModuleData,
	ILoaderResultEntry,
	ModuleLoaderHooks,
} from "../loading/contracts";
import { ModuleLoader } from "../loading/ModuleLoader";
import { writeEvent } from "@virello/logging/diagnostics";
import type { Module } from "./Module";
import {
	type ModuleKind,
	ModuleRegistry,
	type ModuleStores,
} from "./ModuleRegistry";

/** Name and loader strategy for a module store. */
export interface ModuleStoreOptions<
	T extends Module,
	StoreName extends ModuleKind = ModuleKind,
> {
	/** Registry key for this kind of module. */
	readonly name: StoreName;
	/** File loading and lifecycle hooks. Defaults to ModuleStore.defaultStrategy. */
	readonly strategy?: ModuleLoaderHooks<T>;
}
/** Receive a module trace message synchronously. The return value is ignored. */
export type ModuleStoreLogger = (value: string) => void;

/** Owns the modules of one kind and awaits their lifecycle hooks. */
export class ModuleStore<
	T extends Module,
	StoreName extends ModuleKind = ModuleKind,
> extends Map<string, T> {
	/** Module registry constructor. */
	public static readonly Registry = ModuleRegistry;
	/** Base class accepted by this store. */
	public readonly Constructor: AbstractConstructor<T>;
	/** Registry key for this store. */
	public readonly name: StoreName;
	/** File loader and store lifecycle hooks. */
	public readonly strategy: ModuleLoaderHooks<T>;
	private readonly [RegisteredModules] = new Map<
		string,
		ModuleRegistration<StoreName>
	>();
	#loaded = false;
	#initialization?: Promise<void>;
	#preparedModules?: T[];
	readonly #insertions = new Map<string, Promise<T>>();
	readonly #unloads = new WeakMap<T, Promise<T>>();

	/**
	 * Create an empty store.
	 * @param pieceConstructor - Base class all modules must extend.
	 * @param options - Registry name and optional loader strategy.
	 */
	constructor(
		pieceConstructor: AbstractConstructor<T>,
		options: ModuleStoreOptions<T, StoreName>,
	) {
		super();
		this.Constructor = pieceConstructor;
		this.name = options.name;
		// The loader checks candidates against this store's constructor before activation.
		this.strategy =
			options.strategy ?? (ModuleStore.defaultStrategy as ModuleLoaderHooks<T>);
	}
	/** Shared framework services. */
	get container(): Container {
		return container;
	}

	/**
	 * Register a class directly, activating it if loading has started. The first registration keeps its name.
	 * @param entry - Module name and class.
	 * @throws If the class is incompatible or activation fails.
	 */
	async addModule(entry: ModuleRegistration<StoreName>): Promise<void> {
		if (
			!isClass(entry.module) ||
			!classExtends(entry.module, this.Constructor as Constructor<T>)
		)
			throw new TypeError(
				`Module "${entry.name}" must extend ${this.Constructor.name}.`,
			);
		if (!this.#loaded && this[RegisteredModules].has(entry.name)) {
			this.warnDuplicate(entry.name, "explicit registration");
			return;
		}
		if (
			this.#loaded ||
			this.#initialization ||
			(this.#preparedModules && !this[RegisteredModules].has(entry.name))
		) {
			const module = this.construct(
				entry.module as unknown as ILoaderResultEntry<T>,
				{
					name: entry.name,
					root: VirtualPath,
					path: VirtualPath,
					extension: "",
				},
			);
			if (!this.#loaded && this.#insertions.has(module.name)) {
				this.warnDuplicate(module.name, "explicit registration");
				return;
			}
			if (
				!this.#loaded &&
				this.#preparedModules?.some((prepared) => prepared.name === module.name)
			)
				this.#preparedModules.push(module);
			else if (this.#loaded || this.#initialization) await this.insert(module);
			else this.#preparedModules!.push(module);
		}
		if (!this[RegisteredModules].has(entry.name))
			this[RegisteredModules].set(entry.name, { ...entry });
		else this.warnDuplicate(entry.name, "explicit registration");
	}

	/**
	 * Construct registered modules, then classes from the given files. Invalid candidates are logged and skipped.
	 * @param files - Ordered absolute module paths.
	 * @param root - Root used for module metadata.
	 * @param imports - Optional import cache shared between stores.
	 * @returns Candidates awaiting activation.
	 */
	async prepare(
		files: string[],
		root: string,
		imports = new Map<string, Promise<Record<string, unknown>>>(),
	): Promise<T[]> {
		const modules: T[] = [];
		for (const entry of this[RegisteredModules].values()) {
			try {
				modules.push(
					this.construct(entry.module as unknown as ILoaderResultEntry<T>, {
						name: entry.name,
						root: VirtualPath,
						path: VirtualPath,
						extension: "",
					}),
				);
			} catch (cause) {
				this.report(entry.name, cause);
			}
		}
		this.#preparedModules = modules;
		for (const file of files)
			modules.push(...(await this.prepareFile(root, file, imports)));
		return modules;
	}

	private async prepareFile(
		root: string,
		path: string,
		imports: Map<string, Promise<Record<string, unknown>>>,
	): Promise<T[]> {
		const data = this.strategy.filter(path);
		if (!data) return [];
		const modules: T[] = [];
		try {
			for await (const Ctor of this.strategy.load(this, {
				root,
				...data,
				imports,
			})) {
				try {
					modules.push(this.construct(Ctor, { root, ...data }));
				} catch (cause) {
					this.report(path, cause);
				}
			}
		} catch (cause) {
			this.report(path, cause);
		}
		return modules;
	}

	/**
	 * Activate prepared modules once, then run onLoadAll. Invalid modules are isolated; failed rollback rejects.
	 * @param modules - Candidates in activation order.
	 * @returns The shared initialization promise.
	 */
	initialize(modules: T[]): Promise<void> {
		if (!this.#initialization) this.#preparedModules = modules;
		this.#initialization ??= Promise.resolve().then(async () => {
			try {
				for (const module of modules) {
					try {
						await this.insert(module);
					} catch (cause) {
						if (cause instanceof ModuleCleanupError) throw cause;
						this.report(module.location.full, cause);
					}
				}
			} finally {
				this.#preparedModules = undefined;
			}
			await this.strategy.onLoadAll(this);
			this.#loaded = true;
		});
		return this.#initialization;
	}

	private report(source: string, cause: unknown): void {
		if (container.logger)
			writeEvent(container.logger, "error", {
				component: "modules",
				event: "module_skipped",
				message:
					"Module was not activated; fix its source before loading it again.",
				context: { store: this.name, source },
				error: cause,
			});
	}

	private warnDuplicate(name: string, source: string): void {
		if (container.logger)
			writeEvent(container.logger, "alert", {
				component: "modules",
				event: "duplicate_module",
				message:
					"Ignored a duplicate module; the accepted module keeps this name.",
				context: { store: this.name, module: name, source },
			});
	}

	/**
	 * Await loader and module cleanup once, then remove the instance even if cleanup failed.
	 * @param name - Registered name or compatible instance.
	 * @returns The unloaded module.
	 * @throws If resolution or cleanup fails.
	 */
	async unload(name: string | T): Promise<T> {
		const module = this.resolve(name);
		let pending = this.#unloads.get(module);
		if (!pending) {
			pending = Promise.resolve().then(() => this.unloadModule(module));
			this.#unloads.set(module, pending);
		}
		return pending;
	}

	private async unloadModule(module: T): Promise<T> {
		const errors: unknown[] = [];
		try {
			await this.strategy.onUnload(this, module);
		} catch (error) {
			errors.push(error);
		}
		try {
			await module.onUnload();
		} catch (error) {
			errors.push(error);
		}
		if (super.get(module.name) === module) this.delete(module.name);
		if (errors.length)
			throw new AggregateError(
				errors,
				`Could not unload module "${module.name}".`,
			);
		if (Object.is(container.modules.get(this.name), this))
			container.client?.emit("moduleUnloaded", this, module);
		return module;
	}

	/**
	 * Wait for pending insertions, unload every stored module, then run onUnloadAll.
	 * @returns Unloaded modules when all cleanup succeeds.
	 * @throws An AggregateError after attempting every cleanup if any failed.
	 */
	async unloadAll(): Promise<T[]> {
		// Runtime registrations may still be activating when the client starts closing.
		await Promise.allSettled([...this.#insertions.values()]);
		const results = await Promise.allSettled(
			[...this.values()].map((module) => this.unload(module)),
		);
		const errors = results
			.filter((result) => result.status === "rejected")
			.map((result) => result.reason);
		try {
			await this.strategy.onUnloadAll(this);
		} catch (error) {
			errors.push(error);
		}
		if (errors.length)
			throw new AggregateError(
				errors,
				`Could not unload every module in ${this.name}.`,
			);
		return results.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		);
	}

	/**
	 * Resolve a name or accept a compatible module instance.
	 * @param name - Name to look up or instance to check.
	 * @returns The resolved instance.
	 * @throws ModuleLoadError for a missing name or incompatible value.
	 */
	resolve(name: string | T): T {
		if (typeof name === "string") {
			const module = this.get(name);
			if (!module)
				throw new ModuleLoadError(
					ModuleLoadErrorType.MissingModule,
					`Module "${name}" does not exist.`,
				);
			return module;
		}
		if (name instanceof this.Constructor) return name;
		throw new ModuleLoadError(
			ModuleLoadErrorType.IncorrectType,
			`Expected an instance of ${this.Constructor.name}`,
		);
	}

	/**
	 * Activate a module after earlier insertions with the same name. The first active instance keeps that name.
	 * @param module - Instance to activate. Disabled modules are skipped.
	 * @returns The accepted instance, or the disabled candidate.
	 * @throws If activation or cleanup fails.
	 */
	insert(module: T): Promise<T> {
		const previous = this.#insertions.get(module.name) ?? Promise.resolve();
		const pending = previous
			.catch((cause) => {
				if (cause instanceof ModuleCleanupError) throw cause;
			})
			.then(() => this.activate(module));
		this.#insertions.set(module.name, pending);
		void pending
			.finally(() => {
				if (this.#insertions.get(module.name) === pending)
					this.#insertions.delete(module.name);
			})
			.catch(() => {});
		return pending;
	}

	private async activate(module: T): Promise<T> {
		const previous = super.get(module.name);
		if (previous && this.#unloads.has(previous)) {
			await this.#unloads.get(previous);
			return this.activate(module);
		}
		if (previous === module) return module;
		if (previous) {
			this.warnDuplicate(module.name, module.location.full);
			return previous;
		}
		if (!module.enabled) return module;
		this.#unloads.delete(module);
		try {
			await this.strategy.onLoad(this, module);
			await module.onLoad();
			if (!module.enabled) {
				await this.unload(module);
				return module;
			}
			this.set(module.name, module);
			if (Object.is(container.modules.get(this.name), this))
				container.client?.emit("moduleLoaded", this, module);
			ModuleStore.logger?.(`Activated ${this.name} module "${module.name}".`);
			return module;
		} catch (cause) {
			const errors: unknown[] = [cause];
			try {
				await this.unload(module);
			} catch (error) {
				errors.push(error);
			}
			if (errors.length > 1)
				throw new ModuleCleanupError(
					errors,
					"Module activation and cleanup both failed.",
				);
			throw new AggregateError(
				errors,
				`Could not activate module "${module.name}".`,
				{ cause },
			);
		}
	}

	/**
	 * Construct a module using its static options when present.
	 * @param Ctor - Compatible module class.
	 * @param data - File or virtual registration metadata.
	 * @returns A new module, before activation.
	 * @throws If construction fails or the resulting name is empty.
	 */
	construct(Ctor: ILoaderResultEntry<T>, data: HydratedModuleData): T {
		const context = {
			store: this as unknown as Module.Context["store"],
			root: data.root,
			path: data.path,
			name: data.name,
		};
		const metadata = Reflect.get(Ctor, "options");
		const module = Reflect.construct(
			Ctor,
			metadata === undefined ? [context] : [context, metadata],
		) as T;
		if (typeof module.name !== "string" || !module.name.trim())
			throw new TypeError("Module names must be non-empty strings.");
		return module;
	}
	/** Loader used by new stores without a custom strategy. Defaults to a TypeScript ModuleLoader. */
	static defaultStrategy: ModuleLoaderHooks<Module> = new ModuleLoader();
	/** Optional synchronous module trace sink. Defaults to null; the active client sets it when traceModules is enabled. */
	static logger: ModuleStoreLogger | null = null;
}

/** A named module class registered without scanning a file. */
export interface ModuleRegistration<StoreName extends ModuleKind> {
	/** Name used for the module’s loading context. */
	name: string;
	/** Class compatible with the selected store. */
	module: ModuleStores[StoreName] extends ModuleStore<infer Module>
		? Constructor<Module>
		: never;
}
/** Types and helpers for {@link ModuleStore}. */
export declare namespace ModuleStore {
	/** Shorthand for {@link ModuleStoreOptions}. */
	export type Options<T extends Module> = ModuleStoreOptions<T>;
	/** Shorthand for {@link ModuleStoreLogger}. */
	export type Logger = ModuleStoreLogger;
	/** Shorthand for {@link ModuleStores}. */
	export type RegistryEntries = ModuleStores;
}
