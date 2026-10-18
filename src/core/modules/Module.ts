import type { Awaitable } from "../../utilities/index";
import { type Container, container } from "../Container";
import { ModuleLocation, type ModuleLocationJSON } from "./ModuleLocation";
import type { ModuleKind, StoreFor } from "./ModuleRegistry";
import type { ModuleStore } from "./ModuleStore";

/** The context for the module, contains extra information from the store, the module's path, and the store that loaded it. */
export interface ModuleContext<StoreName extends ModuleKind = ModuleKind> {
	/** The root directory the module was loaded from. */
	readonly root: string;

	/** Absolute path to the module file, or the virtual path for a direct class registration. */
	readonly path: string;

	/** The module's name extracted from the path. */
	readonly name: string;

	/** The store that loaded the module. */
	readonly store: StoreFor<StoreName>;
}

/** The options for the {@link Module}. */
export interface ModuleOptions {
	/** Override the context name. Defaults to the name supplied by the loader or registration. */
	readonly name?: string;

	/** Allow this module to activate. Defaults to true; changing the flag alone does not unload an active module. */
	readonly enabled?: boolean;
}

/** Base module with an owning store, file metadata, and awaited load/unload hooks. */
export class Module<
	Options extends ModuleOptions = ModuleOptions,
	StoreName extends ModuleKind = ModuleKind,
> {
	/** Module location metadata constructor. */
	public static readonly Location = ModuleLocation;
	/** Optional class metadata, passed as constructor options by the loader. */
	public static readonly options?: ModuleOptions;
	/** The store that contains the module. */
	public readonly store: StoreFor<StoreName>;

	/** The location metadata for the module's file. */
	public readonly location: ModuleLocation;

	/** The name of the module. */
	public readonly name: string;

	/** Whether the module is enabled. */
	public enabled: boolean;

	/** The raw options passed to this {@link Module} */
	public readonly options: Options;

	/**
	 * Keep the module’s context and options. Lifecycle hooks run when the store activates it.
	 * @param context - Loader metadata and owning store.
	 * @param options - Module settings; defaults to an empty object.
	 */
	public constructor(
		context: Module.Context<StoreName>,
		options: ModuleOptions = {},
	) {
		this.store = context.store;
		this.location = new ModuleLocation(context.path, context.root);
		this.name = options.name ?? context.name;
		this.enabled = options.enabled ?? true;
		this.options = options as Options;
	}

	/** A reference to the {@link Container} object for ease of use. */
	public get container(): Container {
		return container;
	}

	/**
	 * Initialize this module before it enters the store. The store awaits the result.
	 * @returns Optional initialization work; its value is ignored.
	 */
	public onLoad(): Awaitable<unknown> {
		return undefined;
	}

	/**
	 * Release this module’s resources before the store removes it, including after failed activation.
	 * @returns Optional cleanup work; its value is ignored.
	 */
	public onUnload(): Awaitable<unknown> {
		return undefined;
	}

	/**
	 * Unload this instance if it is still stored, then disable it.
	 * @throws If the store’s cleanup hooks fail; the enabled flag is then left unchanged.
	 */
	public async unload() {
		if (this.store.get(this.name) === this)
			await (this.store as ModuleStore<Module>).unload(this);
		this.enabled = false;
	}

	/** Defines the `JSON.stringify` behavior of this module. */
	public toJSON(): ModuleJSON {
		return {
			location: this.location.toJSON(),
			name: this.name,
			enabled: this.enabled,
			options: this.options,
		};
	}
}

/** The return type of {@link Module.toJSON}. */
export interface ModuleJSON {
	/** Serialized file location. */
	location: ModuleLocationJSON;
	/** Registered module name. */
	name: string;
	/** Current enabled flag. */
	enabled: boolean;
	/** Options supplied when the module was constructed. */
	options: ModuleOptions;
}

/** Types and helpers for {@link Module}. */
export declare namespace Module {
	/** Shorthand for {@link ModuleOptions}. */
	export type Options = ModuleOptions;
	/** Shorthand for {@link ModuleContext}. */
	export type Context<StoreName extends ModuleKind = ModuleKind> =
		ModuleContext<StoreName>;
	/** Shorthand for {@link ModuleJSON}. */
	export type JSON = ModuleJSON;
	/** Shorthand for {@link ModuleLocationJSON}. */
	export type LocationJSON = ModuleLocationJSON;
}
