import {
	SlashCommandBuilder,
	type SlashCommandOptionsOnlyBuilder,
	type SlashCommandSubcommandsOnlyBuilder,
	ContextMenuCommandBuilder,
} from "discord.js";

import {
	ApplicationCommandType,
	type RESTPostAPIApplicationCommandsJSONBody,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
	type RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { type ApplicationCommand as APIApplicationCommand } from "discord.js";

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
		name_localizations: command.nameLocalizations,
		dm_permission: command.dmPermission ?? undefined,
		nsfw: command.nsfw,
		default_member_permissions:
			command.defaultMemberPermissions?.bitfield.toString() ?? null,
		integration_types: command.integrationTypes ?? undefined,
		contexts: command.contexts ?? undefined,
	};
	if (command.type === ApplicationCommandType.ChatInput)
		return {
			...common,
			type: command.type,
			description: command.description,
			description_localizations: command.descriptionLocalizations,
			options: command.options.map(optionToAPI),
		};
	if (
		command.type === ApplicationCommandType.User ||
		command.type === ApplicationCommandType.Message
	)
		return { ...common, type: command.type };
	throw new TypeError(`Unsupported registered command type: ${command.type}`);
}

/** Normalize registration comparison data; command objects stay owned by discord.js. */
function optionToAPI(
	option: import("discord.js").ApplicationCommandOption,
): import("discord-api-types/v10").APIApplicationCommandOption {
	const data: Record<string, unknown> = { ...option };
	for (const [property, field] of Object.entries({
		nameLocalizations: "name_localizations",
		descriptionLocalizations: "description_localizations",
		channelTypes: "channel_types",
		minValue: "min_value",
		maxValue: "max_value",
		minLength: "min_length",
		maxLength: "max_length",
	})) {
		if (property in data) {
			data[field] = data[property];
			delete data[property];
		}
	}
	if ("options" in option) data.options = option.options?.map(optionToAPI);
	if ("choices" in option)
		data.choices = option.choices?.map((choice) => {
			const { nameLocalizations, ...rest } = choice;
			return {
				...rest,
				...(nameLocalizations ? { name_localizations: nameLocalizations } : {}),
			};
		});
	return data as unknown as import("discord-api-types/v10").APIApplicationCommandOption;
}
