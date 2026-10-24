import type { AliasModule } from "./AliasModule";
import type { ModuleKind } from "./ModuleRegistry";
import { ModuleStore } from "./ModuleStore";

/** The store class which contains {@link AliasModule}s. */
export class AliasModuleStore<
	T extends AliasModule,
	StoreName extends ModuleKind = ModuleKind,
> extends ModuleStore<T, StoreName> {
	/** The aliases referencing to pieces. */
	public readonly aliases = new Map<string, T>();

	/** Looks up the name by the store, falling back to an alias lookup. */
	public override get(key: string): T | undefined {
		return super.get(key) ?? this.aliases.get(key);
	}

	/** Check whether a key is in the store, or is an alias */
	public override has(key: string): boolean {
		return super.has(key) || this.aliases.has(key);
	}

	/** Unloads a module given its instance or its name, and removes all the aliases. */
	public override unload(name: string | T): Promise<T> {
		const module = this.resolve(name);

		// Unload all aliases for the given module:
		for (const alias of module.aliases) {
			// We don't want to delete aliases that were overriden by another module:
			const aliasPiece = this.aliases.get(alias);
			if (aliasPiece === module) this.aliases.delete(alias);
		}

		return super.unload(module);
	}

	/** Inserts a module into the store, and adds all the aliases. */
	public override async insert(module: T) {
		const accepted = await super.insert(module);
		if (super.get(module.name) !== module) return accepted;
		for (const key of module.aliases) {
			this.aliases.set(key, module);
		}

		return module;
	}
}
