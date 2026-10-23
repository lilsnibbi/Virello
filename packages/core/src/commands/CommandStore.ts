import { AliasModuleStore } from "../core/modules/index";
import type { Args } from "./arguments/Args";
import { Command } from "./Command";
import { registries } from "./registration/registries";

/** Stores command modules and their aliases. */
export class CommandStore extends AliasModuleStore<Command, "commands"> {
	/** Create an empty command store with alias support. */
	public constructor() {
		super(Command, { name: "commands" });
	}

	/** Get all the command categories. */
	public get categories(): string[] {
		const categories = new Set(
			[...this.values()].map((command) => command.category),
		);
		categories.delete(null);
		return [...categories] as string[];
	}

	/**
	 * Activate a command and keep its registry in the shared registry map.
	 * @param module - Command to activate.
	 * @returns The accepted command. The first active command keeps a duplicate name.
	 */
	public override async insert(module: Command): Promise<Command> {
		const accepted = await super.insert(module);
		// Another staged candidate may have removed this name's shared registry during failed activation.
		if (super.get(accepted.name) === accepted)
			registries.set(accepted.name, accepted.applicationCommandRegistry);
		return accepted;
	}

	/**
	 * Remove a command’s routing aliases and registry, then await its cleanup.
	 * @param name - Command name, alias, or instance.
	 * @returns The unloaded command.
	 * @throws If resolution or cleanup fails.
	 */
	public override unload(
		name: string | Command,
	): Promise<Command<Args, Command.Options>> {
		const module = this.resolve(name);

		// Remove the aliases from the store
		for (const nameOrId of module.applicationCommandRegistry
			.chatInputCommands) {
			const aliasedPiece = this.aliases.get(nameOrId);
			if (aliasedPiece === module) {
				this.aliases.delete(nameOrId);
			}
		}

		for (const nameOrId of module.applicationCommandRegistry
			.contextMenuCommands) {
			const aliasedPiece = this.aliases.get(nameOrId);
			if (aliasedPiece === module) {
				this.aliases.delete(nameOrId);
			}
		}

		// Remove the registry from the application command registries
		const current = super.get(module.name);
		if (
			(!current || current === module) &&
			registries.get(module.name) === module.applicationCommandRegistry
		)
			registries.delete(module.name);

		return super.unload(name);
	}
}
