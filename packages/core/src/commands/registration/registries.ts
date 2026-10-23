import { ApplicationCommandType } from "discord-api-types/v10";
import type { ApplicationCommands as ApplicationCommandManager } from "../../discord/ApplicationCommands";
import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import { container } from "../../core/modules/index";
import { Events } from "../../events/events";
import { retry } from "@virello/util/general";
import type { Command } from "../Command";
import type { CommandStore } from "../CommandStore";
import { InternalRegistryAPIType, RegisterBehavior } from "../enums";
import { getNeededRegistryParameters } from "./getNeededParameters";
import { ApplicationCommandRegistry } from "./Registry";
import {
	emitBulkOverwriteError,
	emitPerRegistryError,
} from "./registriesErrors";
import { bulkOverwriteDebug, bulkOverwriteWarn } from "./registriesLog";

export let defaultBehaviorWhenNotIdentical = RegisterBehavior.Overwrite;
export let defaultGuildIds: ApplicationCommandRegistry.RegisterOptions["guildIds"] =
	undefined;
let bulkOVerwriteRetries = 1;

export const registries = new Map<string, ApplicationCommandRegistry>();

export const allGuildIdsToFetchCommandsFor = new Set<string>();

/** Acquires a registry for a command by its name. */
export function acquire(commandName: string) {
	const existing = registries.get(commandName);
	if (existing) {
		return existing;
	}

	const newRegistry = new ApplicationCommandRegistry(commandName);
	registries.set(commandName, newRegistry);

	return newRegistry;
}

/** Set the default behavior when registered commands aren't identical to provided data. */
export function setDefaultBehaviorWhenNotIdentical(
	behavior?: RegisterBehavior | null,
) {
	defaultBehaviorWhenNotIdentical = behavior ?? RegisterBehavior.Overwrite;
}

/** Return the shared update behavior, initially RegisterBehavior.Overwrite. */
export function getDefaultBehaviorWhenNotIdentical() {
	return defaultBehaviorWhenNotIdentical;
}

/** Set the default guild ids for registering commands. This is used when a command is registered _without_ providing `guildIds` in that command's own {@link Command.registerApplicationCommands} method. */
export function setDefaultGuildIds(
	guildIds?: ApplicationCommandRegistry.RegisterOptions["guildIds"] | null,
) {
	defaultGuildIds = guildIds ?? undefined;
}

/** Return the fallback guild ID array, or undefined for global registration. */
export function getDefaultGuildIds() {
	return defaultGuildIds;
}

/** Set the amount of retries for when registering commands, only applies when {@link defaultBehaviorWhenNotIdentical} is set to {@link RegisterBehavior.BulkOverwrite}. */
export function setBulkOverwriteRetries(newAmountOfRetries: number | null) {
	newAmountOfRetries ??= 1;

	if (newAmountOfRetries <= 0)
		throw new RangeError("The amount of retries must be greater than 0");

	bulkOVerwriteRetries = newAmountOfRetries;
}

/** Return the maximum bulk-overwrite attempt count, initially 1. */
export function getBulkOverwriteRetries() {
	return bulkOVerwriteRetries;
}

export async function handleRegistryAPICalls() {
	container.client.emit(Events.ApplicationCommandRegistriesInitialising);

	const commandStore = container.modules.require("commands");

	for (const command of commandStore.values()) {
		if (command.registerApplicationCommands) {
			try {
				await command.registerApplicationCommands(
					command.applicationCommandRegistry,
				);
			} catch (error) {
				emitPerRegistryError(error, command);
			}
		}
	}

	if (getDefaultBehaviorWhenNotIdentical() === RegisterBehavior.BulkOverwrite) {
		await handleBulkOverwrite(
			commandStore,
			container.client.application!.commands,
		);
		return;
	}

	const params = await getNeededRegistryParameters(
		allGuildIdsToFetchCommandsFor,
	);

	await handleAppendOrUpdate(commandStore, params);
}

export async function handleBulkOverwrite(
	commandStore: CommandStore,
	applicationCommands: ApplicationCommandManager,
) {
	const now = Date.now();

	// Map registries by guild, global, etc
	const foundGlobalCommands: BulkOverwriteData[] = [];
	const foundGuildCommands: Record<string, BulkOverwriteData[]> = {};

	// Collect all data
	for (const command of commandStore.values()) {
		const registry = command.applicationCommandRegistry;

		for (const call of registry["apiCalls"]) {
			// Guild only cmd
			if (call.registerOptions.guildIds?.length) {
				for (const guildId of call.registerOptions.guildIds) {
					foundGuildCommands[guildId] ??= [];

					foundGuildCommands[guildId].push({
						module: command,
						data: call.builtData,
					});
				}
				continue;
			}

			// Global command
			foundGlobalCommands.push({ module: command, data: call.builtData });
		}
	}

	// Handle global commands
	await handleBulkOverwriteGlobalCommands(
		commandStore,
		applicationCommands,
		foundGlobalCommands,
	);

	// Handle guild commands
	for (const [guildId, guildCommands] of Object.entries(foundGuildCommands)) {
		await handleBulkOverwriteGuildCommands(
			commandStore,
			applicationCommands,
			guildId,
			guildCommands,
		);
	}

	container.client.emit(
		Events.ApplicationCommandRegistriesRegistered,
		registries,
		Date.now() - now,
	);
}

async function handleBulkOverwriteGlobalCommands(
	commandStore: CommandStore,
	applicationCommands: ApplicationCommandManager,
	foundGlobalCommands: BulkOverwriteData[],
) {
	try {
		bulkOverwriteDebug(foundGlobalCommands.length);
		const result = await retry(
			() => applicationCommands.set(foundGlobalCommands.map((x) => x.data)),
			bulkOVerwriteRetries,
		);

		// Go through each registered command, find its module and alias it
		for (const [id, globalCommand] of result.entries()) {
			const module = foundGlobalCommands.find(
				(x) =>
					x.data.name === globalCommand.name &&
					(x.data.type ?? ApplicationCommandType.ChatInput) ===
						globalCommand.type,
			)?.module;

			if (module) {
				const registry = module.applicationCommandRegistry;

				switch (globalCommand.type) {
					case ApplicationCommandType.ChatInput: {
						registry["handleIdAddition"](InternalRegistryAPIType.ChatInput, id);
						break;
					}
					case ApplicationCommandType.User:
					case ApplicationCommandType.Message: {
						registry["handleIdAddition"](
							InternalRegistryAPIType.ContextMenu,
							id,
						);
						break;
					}
				}

				// idHints are useless, and any manually added id or names could end up not being valid any longer if you use bulk overwrites
				// That said, this might be an issue, so we might need to do it like `handleAppendOrUpdate`
				commandStore.aliases.set(id, module);
			} else {
				bulkOverwriteWarn(globalCommand.name, id);
			}
		}

		container.client.emit(
			Events.ApplicationCommandRegistriesBulkOverwrite,
			result,
			null,
		);
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") throw error;

		emitBulkOverwriteError(error, null);
	}
}

async function handleBulkOverwriteGuildCommands(
	commandStore: CommandStore,
	applicationCommands: ApplicationCommandManager,
	guildId: string,
	guildCommands: BulkOverwriteData[],
) {
	try {
		bulkOverwriteDebug(guildCommands.length, guildId);
		const result = await retry(
			() =>
				applicationCommands.set(
					guildCommands.map((x) => x.data),
					guildId,
				),
			bulkOVerwriteRetries,
		);

		// Go through each registered command, find its module and alias it
		for (const [id, guildCommand] of result.entries()) {
			const module = guildCommands.find(
				(x) =>
					x.data.name === guildCommand.name &&
					(x.data.type ?? ApplicationCommandType.ChatInput) ===
						guildCommand.type,
			)?.module;

			if (module) {
				const registry = module.applicationCommandRegistry;

				switch (guildCommand.type) {
					case ApplicationCommandType.ChatInput: {
						registry["handleIdAddition"](
							InternalRegistryAPIType.ChatInput,
							id,
							guildId,
						);
						break;
					}
					case ApplicationCommandType.User:
					case ApplicationCommandType.Message: {
						registry["handleIdAddition"](
							InternalRegistryAPIType.ContextMenu,
							id,
							guildId,
						);
						break;
					}
				}

				// idHints are useless, and any manually added ids or names could no longer be valid if you use bulk overwrites.
				// That said, this might be an issue, so we might need to do it like `handleAppendOrUpdate`
				commandStore.aliases.set(id, module);
			} else {
				bulkOverwriteWarn(guildCommand.name, id, guildId);
			}
		}

		container.client.emit(
			Events.ApplicationCommandRegistriesBulkOverwrite,
			result,
			guildId,
		);
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") throw error;

		emitBulkOverwriteError(error, guildId);
	}
}

async function handleAppendOrUpdate(
	commandStore: CommandStore,
	{
		applicationCommands,
		globalCommands,
		guildCommands,
	}: Awaited<ReturnType<typeof getNeededRegistryParameters>>,
) {
	const now = Date.now();

	for (const registry of registries.values()) {
		await registry["runAPICalls"](
			applicationCommands,
			globalCommands,
			guildCommands,
		);

		const module = registry.command;

		if (module) {
			for (const nameOrId of module.applicationCommandRegistry
				.chatInputCommands) {
				commandStore.aliases.set(nameOrId, module);
			}

			for (const nameOrId of module.applicationCommandRegistry
				.contextMenuCommands) {
				commandStore.aliases.set(nameOrId, module);
			}
		}
	}

	container.client.emit(
		Events.ApplicationCommandRegistriesRegistered,
		registries,
		Date.now() - now,
	);
}

interface BulkOverwriteData {
	module: Command;
	data: RESTPostAPIApplicationCommandsJSONBody;
}
