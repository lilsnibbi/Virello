import type { JSONEncodable } from "../../../util/jsonEncodable";
import type {
	APIApplicationCommandSubcommandGroupOption,
	APIApplicationCommandSubcommandOption,
} from "discord-api-types/v10";
import { ApplicationCommandOptionType } from "discord-api-types/v10";
import { Mixin } from "ts-mixer";
import { normalizeArray, type RestOrArray } from "../../../util/normalizeArray";
import { resolveBuilder } from "../../../util/resolveBuilder";
import { validate } from "../../../util/validation";
import type { SharedNameAndDescriptionData } from "../SharedNameAndDescription";
import { SharedNameAndDescription } from "../SharedNameAndDescription";
import {
	chatInputCommandSubcommandGroupPredicate,
	chatInputCommandSubcommandPredicate,
} from "./Assertions";
import { SharedChatInputCommandOptions } from "./mixins/SharedChatInputCommandOptions";
import { validateOptions } from "./validateOptions";

export interface ChatInputCommandSubcommandGroupData {
	options?: ChatInputCommandSubcommandBuilder[];
}

/**
 * Represents a folder for subcommands.
 *
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#subcommands-and-subcommand-groups}
 */
export class ChatInputCommandSubcommandGroupBuilder
	extends SharedNameAndDescription
	implements JSONEncodable<APIApplicationCommandSubcommandGroupOption>
{
	/**
	 * The API data associated with this subcommand group.
	 *
	 * @internal
	 */
	declare protected readonly data: ChatInputCommandSubcommandGroupData &
		SharedNameAndDescriptionData;

	/**
	 * The options within this subcommand group.
	 */
	public get options(): readonly ChatInputCommandSubcommandBuilder[] {
		this.data.options ??= [];
		return this.data.options;
	}

	/**
	 * Adds a new subcommand to this group.
	 *
	 * @param input - A function that returns a subcommand builder or an already built builder
	 */
	public addSubcommands(
		...input: RestOrArray<
			| ChatInputCommandSubcommandBuilder
			| ((
					subcommandGroup: ChatInputCommandSubcommandBuilder,
			  ) => ChatInputCommandSubcommandBuilder)
		>
	) {
		const normalized = normalizeArray(input);

		const result = normalized.map((builder) =>
			resolveBuilder(builder, ChatInputCommandSubcommandBuilder),
		);

		this.data.options ??= [];
		this.data.options.push(...result);

		return this;
	}

	/** Add one subcommand to this group. */
	public addSubcommand(
		input:
			| ChatInputCommandSubcommandBuilder
			| ((
					builder: ChatInputCommandSubcommandBuilder,
			  ) => ChatInputCommandSubcommandBuilder),
	): this {
		return this.addSubcommands(input);
	}

	/**
	 * Serializes this builder to API-compatible JSON data.
	 *
	 */
	public toJSON(): APIApplicationCommandSubcommandGroupOption {
		const { options, ...rest } = this.data;

		const data = {
			...(structuredClone(rest) as Omit<
				APIApplicationCommandSubcommandGroupOption,
				"type"
			>),
			type: ApplicationCommandOptionType.SubcommandGroup as const,
			options: options?.map((option) => option.toJSON()) ?? [],
		};

		validate(chatInputCommandSubcommandGroupPredicate, data);
		validateOptions(data.options);

		return data;
	}
}

/**
 * A builder that creates API-compatible JSON data for chat input command subcommands.
 *
 * @mixes {@link SharedNameAndDescription}
 * @mixes {@link SharedChatInputCommandOptions}
 * @see {@link https://discord.com/developers/docs/interactions/application-commands#subcommands-and-subcommand-groups}
 */
export class ChatInputCommandSubcommandBuilder
	extends Mixin(SharedNameAndDescription, SharedChatInputCommandOptions)
	implements JSONEncodable<APIApplicationCommandSubcommandOption>
{
	/**
	 * Serializes this builder to API-compatible JSON data.
	 *
	 */
	public toJSON(): APIApplicationCommandSubcommandOption {
		const { options, ...rest } = this.data;

		const data = {
			...(structuredClone(rest) as Omit<
				APIApplicationCommandSubcommandOption,
				"type"
			>),
			type: ApplicationCommandOptionType.Subcommand as const,
			options: options?.map((option) => option.toJSON()) ?? [],
		};

		validate(chatInputCommandSubcommandPredicate, data);
		validateOptions(data.options);

		return data;
	}
}
