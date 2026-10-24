import {
	ApplicationCommandType,
	type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord-api-types/v10";
import { Mixin } from "ts-mixer";
import { validate } from "../../../util/validation";
import { CommandBuilder } from "../Command";
import { SharedNameAndDescription } from "../SharedNameAndDescription";
import { chatInputCommandPredicate } from "./Assertions";
import { SharedChatInputCommandOptions } from "./mixins/SharedChatInputCommandOptions";
import { SharedChatInputCommandSubcommands } from "./mixins/SharedSubcommands";
import { validateOptions } from "./validateOptions";

/**
 * A builder that creates API-compatible JSON data for chat input commands.
 *
 * @mixes {@link CommandBuilder}\<{@link discord-api-types/v10#(RESTPostAPIChatInputApplicationCommandsJSONBody:interface)}\>
 * @mixes {@link SharedChatInputCommandOptions}
 * @mixes {@link SharedNameAndDescription}
 * @mixes {@link SharedChatInputCommandSubcommands}
 */
export class ChatInputCommandBuilder extends Mixin(
	CommandBuilder<RESTPostAPIChatInputApplicationCommandsJSONBody>,
	SharedChatInputCommandOptions,
	SharedNameAndDescription,
	SharedChatInputCommandSubcommands,
) {
	/**
	 * {@inheritDoc CommandBuilder.toJSON}
	 */
	public toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody {
		const { options, ...rest } = this.data;

		const data: RESTPostAPIChatInputApplicationCommandsJSONBody = {
			...structuredClone(
				rest as Omit<
					RESTPostAPIChatInputApplicationCommandsJSONBody,
					"options"
				>,
			),
			type: ApplicationCommandType.ChatInput,
			options: options?.map((option) => option.toJSON()),
		};

		validate(chatInputCommandPredicate, data);
		validateOptions(data.options ?? []);

		return data;
	}
}

/** Conventional slash-command name for the chat-input builder. */
export { ChatInputCommandBuilder as SlashCommandBuilder };
/** A command surface with top-level options and no subcommand setters. */
export type SlashCommandOptionsOnlyBuilder = Omit<
	ChatInputCommandBuilder,
	keyof SharedChatInputCommandSubcommands
>;
/** A command surface with subcommands and no top-level option setters. */
export type SlashCommandSubcommandsOnlyBuilder = Omit<
	ChatInputCommandBuilder,
	keyof SharedChatInputCommandOptions
>;
