import type { ArgumentStore } from "../../commands/arguments/ArgumentStore";
import type { CommandStore } from "../../commands/CommandStore";
import type { PreconditionStore } from "../../commands/checks/PreconditionStore";
import type { InteractionHandlerStore } from "../../events/interactions/interactionHandlerStore";
import type { ListenerStore } from "../../events/listenerStore";
import type { PatternCommandStore } from "../../extensions/patternCommands/PatternCommandStore";
import type { TaskStore } from "../../extensions/scheduledTasks/TaskStore";
import type { ServiceStore } from "../../extensions/services/ServiceStore";
import { classExtends, isClass } from "@virello/util/general";
import { container } from "../Container";
import { RegisteredModules } from "../loading/constants";
import {
	ModuleGlob,
	type ModulePatterns,
	moduleRoot,
} from "../loading/ModuleGlob";
import { writeEvent } from "@virello/logging/diagnostics";
import type { Module } from "./Module";
import type { ModuleRegistration, ModuleStore } from "./ModuleStore";

/** A strict-typed store registry. This is available in {@link container}. */
export class ModuleRegistry extends Map<ModuleKind, ModuleStoreValue> {
	/** The queue of pieces to load. */
	readonly #pendingManuallyRegisteredPieces = new Map<
		ModuleKind,
		ModuleRegistration<ModuleKind>[]
	>();

	private readonly discovery = new Map<ModuleKind, ModuleGlob>();
	private loadPromise?: Promise<void>;
	private startup?: Promise<void>;
	/** Optional hook awaited once before discovery starts. A rejection fails startup. */
	public beforeLoad?: () => Promise<void>;
	/** Optional cleanup awaited after startup fails. Cleanup errors are combined with the original failure. */
	public onFailure?: () => Promise<void>;

	/** Configure exactly which files belong to each kind of module. */
	public configure(patterns: ModulePaths = {}, root?: string | URL): this {
		if (this.loadPromise)
			throw new Error(
				"Module patterns cannot change after startup. Restart the process.",
			);
		const resolvedRoot = moduleRoot(root);
		const next = new Map<ModuleKind, ModuleGlob>();
		for (const [kind, value] of Object.entries(patterns)) {
			if (!this.has(kind))
				throw new TypeError(
					`No module store is registered for "${kind}". Enable its extension first.`,
				);
			try {
				next.set(kind as ModuleKind, new ModuleGlob(resolvedRoot, value));
			} catch (cause) {
				throw new TypeError(`Invalid module patterns for "${kind}".`, {
					cause,
				});
			}
		}
		this.discovery.clear();
		for (const [kind, glob] of next) this.discovery.set(kind, glob);
		return this;
	}

	/** Load once in a stable order. Concurrent calls share the same startup result. */
	public load(): Promise<void> {
		if (this.loadPromise) return this.loadPromise;
		this.startup = Promise.resolve().then(async () => {
			await this.beforeLoad?.();
			const imports = new Map<string, Promise<Record<string, unknown>>>();
			const staged = new Map<ModuleStore<Module>, Module[]>();
			for (const store of this.values() as IterableIterator<
				ModuleStore<Module>
			>) {
				const glob = this.discovery.get(store.name);
				let files: string[] = [];
				if (glob)
					try {
						files = await glob.files((path, cause) => {
							writeEvent(container.logger, "error", {
								component: "modules",
								event: "path_discovery_failed",
								message:
									"Module path could not be read; check its location and permissions. Other configured paths will still load.",
								context: { store: store.name, path },
								error: cause,
							});
						});
					} catch (cause) {
						if (container.logger)
							writeEvent(container.logger, "error", {
								component: "modules",
								event: "discovery_failed",
								message:
									"Module discovery failed for this store; explicitly registered modules will still load.",
								context: { store: store.name },
								error: cause,
							});
					}
				staged.set(
					store,
					await store.prepare(files, glob?.root ?? process.cwd(), imports),
				);
			}
			for (const [store, pieces] of staged) await store.initialize(pieces);
			if (container.logger)
				writeEvent(container.logger, "debug", {
					component: "modules",
					event: "loaded",
					message: "Module loading finished; valid handlers are registered.",
					context: {
						stores: this.size,
						modules: [...this.values()].reduce(
							(count, store) => count + store.size,
							0,
						),
					},
				});
		});
		this.loadPromise = this.startup.catch(async (cause) => {
			try {
				await this.onFailure?.();
			} catch (cleanup) {
				throw new AggregateError(
					[cause, cleanup],
					"Startup and cleanup failed.",
					{ cause: cleanup },
				);
			}
			throw cause;
		});
		return this.loadPromise;
	}

	/** Wait for startup to settle before closing the client. */
	public async idle(): Promise<void> {
		await this.startup?.catch(() => undefined);
	}

	/**
	 * Look up a module store, preserving its declared store type for known keys.
	 * @param key - Store name.
	 * @returns The registered store, or undefined.
	 */
	public override get<K extends ModuleKind>(
		key: K,
	): ModuleStores[K] | undefined;
	/**
	 * Look up a module store, preserving its declared store type for known keys.
	 * @param key - Store name.
	 * @returns The registered store, or undefined.
	 */
	public override get(key: string): ModuleStoreValue | undefined;
	/**
	 * Look up a module store, preserving its declared store type for known keys.
	 * @param key - Store name.
	 * @returns The registered store, or undefined.
	 */
	public override get(key: string): ModuleStoreValue | undefined {
		return super.get(key as ModuleKind);
	}
	/**
	 * Check whether a store name is registered.
	 * @param key - Store name.
	 * @returns Whether a store exists.
	 */
	public override has(key: string): boolean {
		return super.has(key as ModuleKind);
	}

	/** Require a store and explain a missing extension. */
	public require<K extends ModuleKind>(key: K): ModuleStores[K] {
		const store = this.get(key);
		if (!store)
			throw new Error(
				`Module store "${key}" is not registered. Enable its extension first.`,
			);
		return store;
	}

	/** Register a store. */
	public register<T extends Module>(store: ModuleStore<T>): this {
		if (this.has(store.name))
			throw new Error(`Module store already registered: ${store.name}`);
		const entries = this.#pendingManuallyRegisteredPieces.get(store.name) ?? [];
		for (const entry of entries)
			if (!classExtends(entry.module, store.Constructor))
				throw new TypeError(
					`Registered module must extend ${store.Constructor.name}`,
				);
		this.set(store.name as ModuleKind, store as unknown as ModuleStoreValue);

		// If there was a queue for this store, add it to the store and delete the queue:
		const queue = this.#pendingManuallyRegisteredPieces.get(store.name);
		if (queue) {
			for (const entry of queue) {
				if (!store[RegisteredModules].has(entry.name))
					store[RegisteredModules].set(entry.name, { ...entry });
				else if (container.logger)
					writeEvent(container.logger, "alert", {
						component: "modules",
						event: "duplicate_registration",
						message:
							"Ignored a duplicate registration; the first module keeps this name.",
						context: { store: store.name, module: entry.name },
					});
			}

			this.#pendingManuallyRegisteredPieces.delete(store.name);
		}

		return this;
	}

	/**
	 * Capture stores and registrations added during extension setup.
	 * @returns A function that ends tracking and returns an async rollback callback. Rollback unloads only captured
	 * additions.
	 */
	public trackRegistrations(): () => () => Promise<void> {
		const stores = new Map(this);
		const entries = new Map(
			[...this].map(([name, store]) => [
				name,
				new Map<string, ModuleRegistration<ModuleKind>>(
					store[RegisteredModules] as Map<
						string,
						ModuleRegistration<ModuleKind>
					>,
				),
			]),
		);
		const pending = new Map(
			[...this.#pendingManuallyRegisteredPieces].map(([name, list]) => [
				name,
				new Set(list),
			]),
		);
		return () => {
			const addedStores = [...this].filter(([name]) => !stores.has(name));
			const addedEntries = [...this].flatMap(([name, store]) =>
				[...store[RegisteredModules]]
					.filter(([key]) => !entries.get(name)?.has(key))
					.map(([key, entry]) => ({ store, key, entry })),
			);
			const addedPending = [...this.#pendingManuallyRegisteredPieces].flatMap(
				([name, list]) =>
					list
						.filter((entry) => !pending.get(name)?.has(entry))
						.map((entry) => ({ name, entry })),
			);
			return async () => {
				const errors: unknown[] = [];
				for (const { name, entry } of addedPending) {
					const list = this.#pendingManuallyRegisteredPieces.get(name);
					if (list)
						this.#pendingManuallyRegisteredPieces.set(
							name,
							list.filter((value) => value !== entry),
						);
				}
				for (const { store, key, entry } of addedEntries) {
					if (store[RegisteredModules].get(key) !== entry) continue;
					store[RegisteredModules].delete(key);
					for (const module of store.values())
						if (module instanceof entry.module) {
							try {
								await (store as ModuleStore<Module>).unload(module);
							} catch (error) {
								errors.push(error);
							}
						}
				}
				for (const [name, store] of addedStores)
					if (this.get(name) === store) {
						try {
							await store.unloadAll();
						} catch (error) {
							errors.push(error);
						}
						this.delete(name);
					}
				if (errors.length)
					throw new AggregateError(errors, "Extension module cleanup failed.");
			};
		};
	}

	/**
	 * Remove this store’s registry entry without unloading its modules.
	 * @param store - Store whose name is removed.
	 * @returns This registry.
	 */
	public deregister<T extends Module>(store: ModuleStore<T>): this {
		this.delete(store.name as ModuleKind);
		return this;
	}

	/**
	 * Register a class in its store, or queue it until the store is registered.
	 * @param entry - Store key, name, and module class.
	 * @throws If the value is not a class, is incompatible with an existing store, or fails activation.
	 */
	public async addModule<StoreName extends ModuleKind>(
		entry: RegistryModuleRegistration<StoreName>,
	) {
		const store = super.get(entry.store) as unknown as
			ModuleStore<Module, StoreName> | undefined;

		if (store) {
			await store.addModule(entry);
		} else {
			if (!isClass(entry.module)) {
				throw new TypeError(
					`The module ${entry.name} is not a Class. ${String(entry.module)}`,
				);
			}

			const pending =
				this.#pendingManuallyRegisteredPieces.get(entry.store) ?? [];
			pending.push({ ...entry } as unknown as ModuleRegistration<ModuleKind>);
			this.#pendingManuallyRegisteredPieces.set(entry.store, pending);
		}
	}
}

/** A type utility to get the keys of {@linkcode ModuleStores}. */
export type ModuleKind = keyof ModuleStores;

/** A type utility to get the values of {@linkcode ModuleStores}. */
export type ModuleStoreValue = ModuleStores[ModuleKind];

/** The {@link ModuleRegistry}'s registry, use module augmentation against this interface when adding new modules. */
export interface ModuleStores {
	/** Argument resolvers used by message commands. */
	arguments: ArgumentStore;
	/** Commands and their aliases. */
	commands: CommandStore;
	/** Component and interaction handlers. */
	interactions: InteractionHandlerStore;
	/** Discord and framework event listeners. */
	listeners: ListenerStore;
	/** Command checks. */
	preconditions: PreconditionStore;
	/** Regex message commands; requires the patternCommands extension. */
	patterns: PatternCommandStore;
	/** Shared service modules; requires the services extension. */
	services: ServiceStore;
	/** Scheduled task modules; requires the scheduledtasks extension. */
	tasks: TaskStore;
}

/** An entry for a manually registered module using {@linkcode ModuleRegistry.addModule()}. @seealso {@linkcode ModuleRegistry.addModule()} */
export interface RegistryModuleRegistration<
	StoreName extends ModuleKind,
> extends ModuleRegistration<StoreName> {
	/** Store that owns this module class. */
	store: StoreName;
}

/** Type utility to get the {@linkcode ModuleStore} given its name. */
export type StoreFor<StoreName extends ModuleKind> = ModuleKind extends never
	? ModuleStore<Module<Module.Options, StoreName>>
	: ModuleStores[StoreName];

/** Type utility to get the {@linkcode Module} given its {@linkcode ModuleStore}'s name. */
export type ModuleOf<StoreName extends ModuleKind> = ModuleKind extends never
	? Module<Module.Options, StoreName>
	: ModuleStores[StoreName] extends ModuleStore<infer PieceType>
		? PieceType
		: Module<Module.Options, StoreName>;

/** Bun glob patterns by module store. Only configured paths are scanned. */
export type ModulePaths = Partial<Record<ModuleKind, ModulePatterns>>;
