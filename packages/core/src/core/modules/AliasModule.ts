import { Module } from "./Module";
import type { ModuleKind } from "./ModuleRegistry";

/** Module options with additional lookup names. */
export interface AliasModuleOptions extends Module.Options {
	/** The aliases for the module.
	 * @default [] */
	readonly aliases?: readonly string[];
}

/** The module to be stored in {@link AliasModuleStore} instances. */
export class AliasModule<
	Options extends AliasModuleOptions = AliasModuleOptions,
	StoreName extends ModuleKind = ModuleKind,
> extends Module<Options, StoreName> {
	/** Module location metadata constructor. */
	public static override readonly Location = Module.Location;
	/** Optional class metadata passed as constructor options by the loader. */
	public static override readonly options?: AliasModuleOptions;
	/** The aliases for the module. */
	public aliases: readonly string[];

	/**
	 * Create a module with aliases.
	 * @param context - Loader metadata and owning store.
	 * @param options - Module settings; aliases default to an empty list.
	 */
	public constructor(
		context: AliasModule.Context<StoreName>,
		options: AliasModuleOptions = {},
	) {
		super(context, options);
		this.aliases = options.aliases ?? [];
	}

	/** Defines the `JSON.stringify` behavior of this alias module. */
	public override toJSON(): AliasModule.JSON {
		return {
			...super.toJSON(),
			aliases: this.aliases.slice(),
		};
	}
}

/** The return type of {@link AliasModule.toJSON}. */
export interface AliasModuleJSON extends Module.JSON {
	/** Copy of the module’s additional lookup names. */
	aliases: string[];
	/** Original options, including aliases. */
	options: AliasModuleOptions;
}

/** Types and helpers for {@link AliasModule}. */
export declare namespace AliasModule {
	/** Shorthand for {@link AliasModuleOptions}. */
	export type Options = AliasModuleOptions;
	/** Shorthand for {@link Module.Context}. */
	export type Context<StoreName extends ModuleKind = ModuleKind> =
		Module.Context<StoreName>;
	/** Shorthand for {@link AliasModuleJSON}. */
	export type JSON = AliasModuleJSON;
	/** Shorthand for {@link Module.LocationJSON}. */
	export type LocationJSON = Module.LocationJSON;
}
