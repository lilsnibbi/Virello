import type {
	ContextMenuCommandBuilder,
	SlashCommandBuilder,
	SlashCommandOptionsOnlyBuilder,
	SlashCommandSubcommandsOnlyBuilder,
} from "@discordjs/builders";
import type {
	APIApplicationCommand as ApplicationCommand,
	RESTPostAPIChatInputApplicationCommandsJSONBody as ChatInputApplicationCommandData,
	RESTPostAPIContextMenuApplicationCommandsJSONBody as MessageApplicationCommandData,
	RESTPostAPIContextMenuApplicationCommandsJSONBody as UserApplicationCommandData,
} from "discord-api-types/v10";
import type { ApplicationCommands as ApplicationCommandManager } from "../../discord/ApplicationCommands";
import {
	ApplicationCommandType,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
	type RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { writeEvent } from "../../core/logging/diagnostics";
import { container } from "../../core/modules/index";
import type { CommandLocalisation } from "../../extensions/localisation/types";
import { isNullishOrEmpty } from "../../utilities/index";
import type { Args } from "../arguments/Args";
import type { Command } from "../Command";
import { InternalRegistryAPIType, RegisterBehavior } from "../enums";
import type { CommandOptions } from "../types";
import {
	getCommandDifferences,
	getCommandDifferencesFast,
} from "./computeDifferences";
import type { CommandDifference } from "./computeDifferences/_shared";
import {
	convertApplicationCommandToApiData,
	normalizeChatInputCommand,
	normalizeContextMenuCommand,
} from "./normalizeInputs";
import {
	allGuildIdsToFetchCommandsFor,
	getDefaultBehaviorWhenNotIdentical,
	getDefaultGuildIds,
} from "./registries";

/** Discord application command definitions and routing IDs associated with one command module. */
export class ApplicationCommandRegistry {
	/** The module this registry is for. */
	public readonly commandName: string;

	/** A set of all chat input command names and ids that point to this registry. You should not use this field directly, but instead use {@link ApplicationCommandRegistry.globalChatInputCommandIds} */
	public readonly chatInputCommands = new Set<string>();

	/** A set of all context menu command names and ids that point to this registry. You should not use this field directly, but instead use {@link ApplicationCommandRegistry.globalContextMenuCommandIds} */
	public readonly contextMenuCommands = new Set<string>();

	/** The guild ids that we need to fetch the commands for. */
	public readonly guildIdsToFetch = new Set<string>();

	/** The global slash command id for this command.
	 * @deprecated This field will only show the first global command id registered for this registry. */
	public globalCommandId: string | null = null;

	/** A set of all registered and valid global chat input command ids that point to this registry. */
	public readonly globalChatInputCommandIds = new Set<string>();

	/** A set of all registered and valid global context menu command ids that point to this registry. */
	public readonly globalContextMenuCommandIds = new Set<string>();

	/** The guild command ids for this command.
	 * @deprecated This field will only show the first guild command id registered for this registry per guild. */
	public readonly guildCommandIds = new Map<string, string>();

	/** A map of guild ids to a set of registered and valid chat input command ids that point to this registry. */
	public readonly guildIdToChatInputCommandIds = new Map<string, Set<string>>();

	/** A map of guild ids to a set of registered and valid context menu command ids that point to this registry. */
	public readonly guildIdToContextMenuCommandIds = new Map<
		string,
		Set<string>
	>();

	private readonly apiCalls: InternalAPICall[] = [];

	/**
	 * Create a registry for one command name.
	 * @param commandName - Local command module name. Prefer ApplicationCommandRegistries.acquire to reuse an existing
	 * registry.
	 */
	public constructor(commandName: string) {
		this.commandName = commandName;
	}

	/** Current command module, or undefined if absent. Requires the commands store to be registered. */
	public get command(): Command<Args, CommandOptions> | undefined {
		return container.modules.require("commands").get(this.commandName);
	}

	/**
	 * Queue a slash command definition for the ready registration phase.
	 * @param command - Native data, builder, or callback that configures a supplied builder. Callback return values are
	 * ignored.
	 * @param options - Guild scope, localization, ID hints, and update behavior.
	 * @returns This registry.
	 * @throws For invalid builder data or unavailable/invalid localization settings.
	 */
	public registerChatInputCommand(
		command:
			| ChatInputApplicationCommandData
			| SlashCommandBuilder
			| SlashCommandSubcommandsOnlyBuilder
			| SlashCommandOptionsOnlyBuilder
			| Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
			| ((builder: SlashCommandBuilder) => unknown),
		options?: ApplicationCommandRegistryRegisterOptions,
	) {
		const normalized = normalizeChatInputCommand(command);
		const builtData =
			options?.localisation === undefined
				? normalized
				: this.localize(normalized, options.localisation);

		this.chatInputCommands.add(builtData.name);

		const guildIdsToRegister = this.getGuildIdsToRegister(options);

		const registerOptions = {
			registerCommandIfMissing: true,
			behaviorWhenNotIdentical: getDefaultBehaviorWhenNotIdentical(),
			guildIds: guildIdsToRegister,
			...(options ?? {}),
		};

		this.apiCalls.push({
			builtData,
			registerOptions,
			type: InternalRegistryAPIType.ChatInput,
		});

		if (options?.idHints) {
			for (const hint of options.idHints) {
				this.chatInputCommands.add(hint);
			}
		}

		this.processGuildIds(guildIdsToRegister);

		return this;
	}

	/**
	 * Queue a user or message context-menu definition for the ready registration phase.
	 * @param command - Native data, builder, or callback that configures a supplied builder. Callback return values are
	 * ignored.
	 * @param options - Guild scope, localization, ID hints, and update behavior.
	 * @returns This registry.
	 * @throws For invalid builder data or unavailable/invalid localization settings.
	 */
	public registerContextMenuCommand(
		command:
			| UserApplicationCommandData
			| MessageApplicationCommandData
			| ContextMenuCommandBuilder
			| ((builder: ContextMenuCommandBuilder) => unknown),
		options?: ApplicationCommandRegistryRegisterOptions,
	) {
		const normalized = normalizeContextMenuCommand(command);
		const builtData =
			options?.localisation === undefined
				? normalized
				: this.localize(normalized, options.localisation);

		this.contextMenuCommands.add(builtData.name);

		const guildIdsToRegister = this.getGuildIdsToRegister(options);

		const registerOptions = {
			registerCommandIfMissing: true,
			behaviorWhenNotIdentical: getDefaultBehaviorWhenNotIdentical(),
			guildIds: guildIdsToRegister,
			...(options ?? {}),
		};

		this.apiCalls.push({
			builtData,
			registerOptions,
			type: InternalRegistryAPIType.ContextMenu,
		});

		if (options?.idHints) {
			for (const hint of options.idHints) {
				this.contextMenuCommands.add(hint);
			}
		}

		this.processGuildIds(guildIdsToRegister);

		return this;
	}

	/**
	 * Add local slash-command name aliases and log a warning for each. This does not create Discord commands.
	 * @param names - Names or arrays of names.
	 * @returns This registry. Prefer numeric ID aliases for stable routing.
	 */
	public addChatInputCommandNames(...names: string[] | string[][]) {
		const flattened = names.flat(Infinity) as string[];

		for (const command of flattened) {
			this.log(
				"alert",
				"name_alias_added",
				"Command routing uses a name alias; use addChatInputCommandIds with a numeric Discord command ID for stable routing.",
				{ alias: command, kind: "chat input" },
			);
			this.chatInputCommands.add(command);
		}

		return this;
	}

	/**
	 * Add local context-menu name aliases and log a warning for each. This does not create Discord commands.
	 * @param names - Names or arrays of names.
	 * @returns This registry. Prefer numeric ID aliases for stable routing.
	 */
	public addContextMenuCommandNames(...names: string[] | string[][]) {
		const flattened = names.flat(Infinity) as string[];

		for (const command of flattened) {
			this.log(
				"alert",
				"name_alias_added",
				"Command routing uses a name alias; use addContextMenuCommandIds with a numeric Discord command ID for stable routing.",
				{ alias: command, kind: "context menu" },
			);
			this.contextMenuCommands.add(command);
		}

		return this;
	}

	/**
	 * Add slash-command IDs to local routing. Nonnumeric values are accepted as names with a warning.
	 * @param commandIds - IDs or arrays of IDs.
	 * @returns This registry.
	 */
	public addChatInputCommandIds(...commandIds: string[] | string[][]) {
		const flattened = commandIds.flat(Infinity) as string[];

		for (const entry of flattened) {
			try {
				BigInt(entry);
				this.log(
					"debug",
					"id_alias_added",
					"Command ID added to local routing.",
					{ commandId: entry, kind: "chat input" },
				);
			} catch {
				this.log(
					"alert",
					"name_alias_added",
					"Expected a numeric Discord command ID; accepted this value as a name alias. Use addChatInputCommandIds with a real command ID.",
					{ alias: entry, kind: "chat input" },
				);
			}
			this.chatInputCommands.add(entry);
		}

		return this;
	}

	/**
	 * Add context-menu IDs to local routing. Nonnumeric values are accepted as names with a warning.
	 * @param commandIds - IDs or arrays of IDs.
	 * @returns This registry.
	 */
	public addContextMenuCommandIds(...commandIds: string[] | string[][]) {
		const flattened = commandIds.flat(Infinity) as string[];

		for (const entry of flattened) {
			try {
				BigInt(entry);
				this.log(
					"debug",
					"id_alias_added",
					"Command ID added to local routing.",
					{ commandId: entry, kind: "context menu" },
				);
			} catch {
				this.log(
					"alert",
					"name_alias_added",
					"Expected a numeric Discord command ID; accepted this value as a name alias. Use addContextMenuCommandIds with a real command ID.",
					{ alias: entry, kind: "context menu" },
				);
			}
			this.contextMenuCommands.add(entry);
		}

		return this;
	}

	/**
	 * Compare and submit queued registrations outside bulk-overwrite mode. Individual failures are logged after all calls
	 * settle.
	 * @param applicationCommands - Discord application command manager.
	 * @param globalCommands - Previously fetched global commands.
	 * @param guildCommands - Previously fetched commands by guild.
	 * @throws RangeError if used with the bulk-overwrite default.
	 */
	protected async runAPICalls(
		applicationCommands: ApplicationCommandManager,
		globalCommands: Map<string, ApplicationCommand>,
		guildCommands: Map<string, Map<string, ApplicationCommand>>,
	) {
		// Early return for no API calls
		if (this.apiCalls.length === 0) {
			// If we have no API calls to do then we simply return (can happen if the registry is used directly)
			return;
		}

		if (
			getDefaultBehaviorWhenNotIdentical() === RegisterBehavior.BulkOverwrite
		) {
			throw new RangeError(
				`"runAPICalls" was called for "${this.commandName}" but the defaultBehaviorWhenNotIdentical is "BulkOverwrite". This should not happen.`,
			);
		}

		this.log(
			"debug",
			"checking",
			"Comparing local registrations with Discord commands.",
			{ registrations: this.apiCalls.length },
		);

		const results = await Promise.allSettled(
			this.apiCalls.map((call) =>
				this.handleAPICall(
					applicationCommands,
					globalCommands,
					guildCommands,
					call,
				),
			),
		);

		const errored = results.filter(
			(result) => result.status === "rejected",
		) as PromiseRejectedResult[];

		if (errored.length) {
			this.log(
				"error",
				"command_registration_failed",
				"Some command registrations could not complete; inspect the individual causes before retrying.",
				{ failures: errored.length },
				new AggregateError(errored.map((error) => error.reason)),
			);
		}
	}

	/**
	 * Record a successfully registered command ID in global/guild tracking and local routing.
	 * @param type - Slash or context-menu registration.
	 * @param id - Discord command ID.
	 * @param guildId - Guild ID, or null/undefined for a global command.
	 */
	protected handleIdAddition(
		type: InternalRegistryAPIType,
		id: string,
		guildId?: string | null,
	) {
		switch (type) {
			case InternalRegistryAPIType.ChatInput: {
				this.addChatInputCommandIds(id);

				if (guildId) {
					const ids =
						this.guildIdToChatInputCommandIds.get(guildId) ?? new Set<string>();
					ids.add(id);
					this.guildIdToChatInputCommandIds.set(guildId, ids);
				} else {
					this.globalChatInputCommandIds.add(id);
				}
				break;
			}
			case InternalRegistryAPIType.ContextMenu: {
				this.addContextMenuCommandIds(id);

				if (guildId) {
					const ids =
						this.guildIdToContextMenuCommandIds.get(guildId) ??
						new Set<string>();
					ids.add(id);
					this.guildIdToContextMenuCommandIds.set(guildId, ids);
				} else {
					this.globalContextMenuCommandIds.add(id);
				}
				break;
			}
		}

		// Old field handling
		if (guildId) {
			// Old, wrongly typed field (thx kyra for spotting >_>)
			if (!this.guildCommandIds.has(guildId)) {
				this.guildCommandIds.set(guildId, id);
			}
		} else {
			// First come, first serve (thx kyra for spotting >_>)
			this.globalCommandId ??= id;
		}
	}

	private localize<T extends InternalAPICall["builtData"]>(
		data: T,
		keys: CommandLocalisation,
	): T {
		if (!container.i18n)
			throw new Error(
				"Command localisation requires the localisation extension.",
			);
		return container.i18n.localizeCommand(data, keys);
	}

	private getGuildIdsToRegister(
		options?: ApplicationCommandRegistryRegisterOptions,
	) {
		let guildIdsToRegister: ApplicationCommandRegistry.RegisterOptions["guildIds"];

		if (!isNullishOrEmpty(options?.guildIds)) {
			guildIdsToRegister = options!.guildIds;
		} else if (!isNullishOrEmpty(getDefaultGuildIds())) {
			guildIdsToRegister = getDefaultGuildIds();
		}

		return guildIdsToRegister;
	}

	private processGuildIds(
		guildIdsToRegister: ApplicationCommandRegistry.RegisterOptions["guildIds"],
	) {
		if (!isNullishOrEmpty(guildIdsToRegister)) {
			for (const id of guildIdsToRegister) {
				this.guildIdsToFetch.add(id);
				allGuildIdsToFetchCommandsFor.add(id);
			}
		}
	}

	private async handleAPICall(
		commandsManager: ApplicationCommandManager,
		globalCommands: Map<string, ApplicationCommand>,
		allGuildsCommands: Map<string, Map<string, ApplicationCommand>>,
		apiCall: InternalAPICall,
	) {
		const { builtData, registerOptions } = apiCall;
		const commandName = builtData.name;
		const behaviorIfNotEqual =
			registerOptions.behaviorWhenNotIdentical ??
			getDefaultBehaviorWhenNotIdentical();

		const findCallback = (entry: ApplicationCommand) => {
			// If the command is a chat input command, we need to check if the entry is a chat input command
			if (
				apiCall.type === InternalRegistryAPIType.ChatInput &&
				entry.type !== ApplicationCommandType.ChatInput
			)
				return false;
			// If the command is a context menu command, we need to check if the entry is a context menu command of the same type
			if (apiCall.type === InternalRegistryAPIType.ContextMenu) {
				// If its a chat input command, it doesn't match
				if (entry.type === ApplicationCommandType.ChatInput) return false;
				// Check the command type (must match)
				if (apiCall.builtData.type !== entry.type) return false;
			}

			// Find the command by name or by id hint (mostly useful for context menus)
			const isInIdHint = registerOptions.idHints?.includes(entry.id);
			return typeof isInIdHint === "boolean"
				? isInIdHint || entry.name === commandName
				: entry.name === commandName;
		};

		let type: string;

		switch (apiCall.type) {
			case InternalRegistryAPIType.ChatInput:
				type = "chat input";
				break;
			case InternalRegistryAPIType.ContextMenu:
				switch (apiCall.builtData.type) {
					case ApplicationCommandType.Message:
						type = "message context menu";
						break;
					case ApplicationCommandType.User:
						type = "user context menu";
						break;
					default:
						type = "unknown-type context menu";
				}
				break;
			default:
				type = "unknown";
		}

		if (!registerOptions.guildIds?.length) {
			const globalCommand = [...globalCommands.values()].find(findCallback);

			if (globalCommand) {
				this.handleIdAddition(apiCall.type, globalCommand.id);
				await this.handleCommandPresent(
					globalCommand,
					builtData,
					behaviorIfNotEqual,
					null,
				);
			} else if (registerOptions.registerCommandIfMissing ?? true) {
				await this.createMissingCommand(commandsManager, builtData, type);
			} else {
				this.log(
					"debug",
					"creation_disabled",
					"Discord command is absent; automatic creation is disabled for this registration.",
					{
						registeredName: commandName,
						type,
						scope: "global",
					},
				);
			}

			return;
		}

		for (const guildId of registerOptions.guildIds) {
			const guildCommands = allGuildsCommands.get(guildId);

			if (!guildCommands) {
				await this.createMissingCommand(
					commandsManager,
					builtData,
					type,
					guildId,
				);
				continue;
			}

			const existingGuildCommand = [...guildCommands.values()].find(
				findCallback,
			);

			if (existingGuildCommand) {
				this.handleIdAddition(apiCall.type, existingGuildCommand.id, guildId);
				await this.handleCommandPresent(
					existingGuildCommand,
					builtData,
					behaviorIfNotEqual,
					guildId,
				);
			} else if (registerOptions.registerCommandIfMissing ?? true) {
				await this.createMissingCommand(
					commandsManager,
					builtData,
					type,
					guildId,
				);
			} else {
				this.log(
					"debug",
					"creation_disabled",
					"Discord command is absent; automatic creation is disabled for this registration.",
					{
						registeredName: commandName,
						type,
						scope: "guild",
						guildId,
					},
				);
			}
		}
	}

	private async handleCommandPresent(
		applicationCommand: ApplicationCommand,
		apiData: InternalAPICall["builtData"],
		behaviorIfNotEqual: RegisterBehavior,
		guildId: string | null,
	) {
		if (behaviorIfNotEqual === RegisterBehavior.BulkOverwrite) {
			this.log(
				"alert",
				"invalid_overwrite_behavior",
				"BulkOverwrite is not valid for one command; using the configured default registration behavior.",
			);

			behaviorIfNotEqual = getDefaultBehaviorWhenNotIdentical();

			if (behaviorIfNotEqual === RegisterBehavior.BulkOverwrite) {
				throw new Error(
					`Invalid behaviorIfNotEqual value ("BulkOverwrite") for command "${this.commandName}", and defaultBehaviorWhenNotIdentical is also "BulkOverwrite". This should not happen.`,
				);
			}
		}

		let differences: CommandDifference[] = [];

		if (behaviorIfNotEqual === RegisterBehavior.VerboseOverwrite) {
			// Step 0: compute differences
			differences = [
				...getCommandDifferences(
					convertApplicationCommandToApiData(applicationCommand),
					apiData,
					guildId !== null,
				),
			];

			// Step 1: if there are no differences, return
			if (!differences.length) {
				this.log(
					"debug",
					"unchanged",
					"Discord command already matches its local definition; no update sent.",
					{
						commandId: applicationCommand.id,
						scope: guildId ? "guild" : "global",
						guildId,
					},
				);
				return;
			}
		}

		// Run the fast path even if the user wants to just log if the command has a difference
		if (
			behaviorIfNotEqual === RegisterBehavior.Overwrite ||
			behaviorIfNotEqual === RegisterBehavior.LogToConsole
		) {
			// Step 0: compute differences
			const areThereDifferences = getCommandDifferencesFast(
				convertApplicationCommandToApiData(applicationCommand),
				apiData,
				guildId !== null,
			);

			// Step 1: if there are no differences, return
			if (!areThereDifferences) {
				this.log(
					"debug",
					"unchanged",
					"Discord command already matches its local definition; no update sent.",
					{
						commandId: applicationCommand.id,
						scope: guildId ? "guild" : "global",
						guildId,
					},
				);
				return;
			}
		}

		this.logCommandDifferencesFound(
			applicationCommand,
			behaviorIfNotEqual === RegisterBehavior.LogToConsole,
			differences,
		);

		// Step 2: if the behavior is to log to console, only log the differences
		if (behaviorIfNotEqual === RegisterBehavior.LogToConsole) {
			return;
		}

		// Step 3: if the behavior is to update, update the command
		try {
			await container.client.application!.commands.edit(
				applicationCommand.id,
				apiData,
				guildId ?? undefined,
			);
			this.log(
				"notif",
				"command_updated",
				"Updated a Discord command to match its local definition.",
				{
					commandId: applicationCommand.id,
					scope: guildId ? "guild" : "global",
					guildId,
				},
			);
		} catch (error) {
			this.log(
				"error",
				"command_update_failed",
				"Discord command update failed; inspect API access and the command definition.",
				{
					commandId: applicationCommand.id,
					scope: guildId ? "guild" : "global",
					guildId,
				},
				error,
			);
		}
	}

	private logCommandDifferencesFound(
		applicationCommand: ApplicationCommand,
		logAsWarn: boolean,
		differences: CommandDifference[],
	) {
		writeEvent(container.logger, logAsWarn ? "alert" : "debug", {
			component: "rest.registration",
			event: "differences_found",
			message: logAsWarn
				? "Discord command differs from local code; this registration is configured to report differences without updating Discord."
				: "Discord command differs from local code; preparing an update.",
			context: {
				command: this.commandName,
				commandId: applicationCommand.id,
				differenceCount: differences.length || undefined,
				paths: differences.length
					? differences.slice(0, 8).map((difference) => difference.key)
					: undefined,
			},
		});
	}

	private async createMissingCommand(
		commandsManager: ApplicationCommandManager,
		apiData: InternalAPICall["builtData"],
		type: string,
		guildId?: string,
	) {
		try {
			const result = await commandsManager.create(apiData, guildId);

			writeEvent(container.logger, "notif", {
				component: "rest.registration",
				event: "command_created",
				message:
					"Published a new Discord command; keep commandId in idHints if its name may change.",
				context: {
					command: this.commandName,
					registeredName: apiData.name,
					commandId: result.id,
					type,
					guildId,
				},
			});

			switch (apiData.type) {
				case undefined:
				case ApplicationCommandType.ChatInput: {
					this.handleIdAddition(
						InternalRegistryAPIType.ChatInput,
						result.id,
						guildId,
					);
					break;
				}
				case ApplicationCommandType.Message:
				case ApplicationCommandType.User: {
					this.handleIdAddition(
						InternalRegistryAPIType.ContextMenu,
						result.id,
						guildId,
					);
					break;
				}
			}
		} catch (err) {
			this.log(
				"error",
				"command_creation_failed",
				"Discord command could not be created; inspect API access, guild scope and command validation.",
				{
					registeredName: apiData.name,
					type,
					scope: guildId ? "guild" : "global",
					guildId,
				},
				err,
			);
		}
	}

	private log(
		level: "debug" | "notif" | "alert" | "error",
		event: string,
		message: string,
		context: Record<string, unknown> = {},
		error?: unknown,
	): void {
		writeEvent(container.logger, level, {
			component: "rest.registration",
			event,
			message,
			context: { command: this.commandName, ...context },
			error,
		});
	}
}

/** Types and helpers for {@link ApplicationCommandRegistry}. */
export declare namespace ApplicationCommandRegistry {
	/** Scope and synchronization options for one queued application command. */
	export interface RegisterOptions {
		/** Opt in to translation keys for Discord presentation; base names and choice values stay unchanged. */
		localisation?: CommandLocalisation;
		/**
		 * Nonempty guild IDs select guild registration. Omit to use shared defaults; an explicitly empty array selects global
		 * API registration.
		 */
		guildIds?: string[];
		/** If we should register the command when it is missing
		 * @default true */
		registerCommandIfMissing?: boolean;
		/** Specifies what we should do when the command is present, but not identical with the data you provided
		 * @default `ApplicationCommandRegistries.getDefaultBehaviorWhenNotIdentical()` */
		behaviorWhenNotIdentical?: Exclude<
			RegisterBehavior,
			RegisterBehavior.BulkOverwrite
		>;
		/** Specifies a list of command ids that we should check in the event of a name mismatch
		 * @default [] */
		idHints?: string[];
	}
}

/** Options for queuing a slash or context-menu command registration. */
export type ApplicationCommandRegistryRegisterOptions =
	ApplicationCommandRegistry.RegisterOptions;

type InternalRegisterOptions = Omit<
	ApplicationCommandRegistry.RegisterOptions,
	"behaviorWhenNotIdentical"
> & {
	behaviorWhenNotIdentical?: RegisterBehavior;
};

export type InternalAPICall =
	| {
			builtData: RESTPostAPIChatInputApplicationCommandsJSONBody;
			registerOptions: InternalRegisterOptions;
			type: InternalRegistryAPIType.ChatInput;
	  }
	| {
			builtData: RESTPostAPIContextMenuApplicationCommandsJSONBody;
			registerOptions: InternalRegisterOptions;
			type: InternalRegistryAPIType.ContextMenu;
	  };
