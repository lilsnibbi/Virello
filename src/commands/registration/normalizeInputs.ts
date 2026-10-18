import {
	ContextMenuCommandBuilder,
	SlashCommandBuilder,
	type SlashCommandOptionsOnlyBuilder,
	type SlashCommandSubcommandsOnlyBuilder,
} from "@discordjs/builders";
import {
	ApplicationCommandType,
	type APIApplicationCommand,
	type RESTPostAPIApplicationCommandsJSONBody,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
	type RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from "discord-api-types/v10";

/** Accept a native command definition, a builder, or a callback configuring a builder. */
export function normalizeChatInputCommand(
	command:
		| RESTPostAPIChatInputApplicationCommandsJSONBody
		| SlashCommandBuilder
		| SlashCommandSubcommandsOnlyBuilder
		| SlashCommandOptionsOnlyBuilder
		| Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">
		| ((builder: SlashCommandBuilder) => unknown),
): RESTPostAPIChatInputApplicationCommandsJSONBody {
	let data: RESTPostAPIChatInputApplicationCommandsJSONBody;
	if (typeof command === "function") {
		const builder = new SlashCommandBuilder();
		command(builder);
		data = builder.toJSON();
	} else
		data = "toJSON" in command ? command.toJSON() : structuredClone(command);
	return {
		dm_permission: true,
		default_member_permissions: null,
		...data,
		type: ApplicationCommandType.ChatInput,
	};
}

export function normalizeContextMenuCommand(
	command:
		| RESTPostAPIContextMenuApplicationCommandsJSONBody
		| ContextMenuCommandBuilder
		| ((builder: ContextMenuCommandBuilder) => unknown),
): RESTPostAPIContextMenuApplicationCommandsJSONBody {
	let data: RESTPostAPIContextMenuApplicationCommandsJSONBody;
	if (typeof command === "function") {
		const builder = new ContextMenuCommandBuilder();
		command(builder);
		data = builder.toJSON();
	} else
		data = "toJSON" in command ? command.toJSON() : structuredClone(command);
	return { dm_permission: true, default_member_permissions: null, ...data };
}

/** Extract writable fields for comparison, retaining native snake_case options and localisations. */
export function convertApplicationCommandToApiData(
	command: APIApplicationCommand,
): RESTPostAPIApplicationCommandsJSONBody {
	const common = {
		name: command.name,
		name_localizations: command.name_localizations,
		dm_permission: command.dm_permission,
		nsfw: command.nsfw,
		default_member_permissions: command.default_member_permissions,
		integration_types: command.integration_types,
		contexts: command.contexts ?? undefined,
	};
	if (command.type === ApplicationCommandType.ChatInput)
		return {
			...common,
			type: command.type,
			description: command.description,
			description_localizations: command.description_localizations,
			options: command.options,
		};
	if (
		command.type === ApplicationCommandType.User ||
		command.type === ApplicationCommandType.Message
	)
		return { ...common, type: command.type };
	throw new TypeError(`Unsupported registered command type: ${command.type}`);
}
