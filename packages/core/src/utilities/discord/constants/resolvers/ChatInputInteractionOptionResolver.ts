import {
	type APIApplicationCommandInteractionDataOption,
	type APIAttachment,
	type APIChatInputApplicationCommandInteraction,
	type APIInteractionDataResolved,
	type APIInteractionDataResolvedChannel,
	type APIInteractionDataResolvedGuildMember,
	type APIRole,
	type APIUser,
	ApplicationCommandOptionType,
} from "discord-api-types/v10";
import type {
	BasicApplicationCommandOptionType,
	RequiredIf,
	TypeToOptionMap,
} from "./util";

/**
 * Read native slash command options after hoisting the selected group/subcommand. Entity getters use the payload’s
 * resolved tables directly.
 */
export class ChatInputInteractionOptionResolver {
	/** The interaction options array */
	private readonly data: APIApplicationCommandInteractionDataOption[] | null =
		null;

	/** The interaction resolved data */
	private readonly resolved: APIInteractionDataResolved | null = null;

	/** Bottom-level options for the interaction If there is a subcommand (or subcommand and group), this represents the options for the subcommand. */
	private readonly hoistedOptions:
		APIApplicationCommandInteractionDataOption[] | null = null;

	/** The name of the subcommand group */
	private readonly group: string | null = null;

	/** The name of the subcommand */
	private readonly subcommand: string | null = null;

	/**
	 * Read a native Discord slash command payload without HTTP requests.
	 * @param interaction - Native API interaction payload, including any resolved entity tables.
	 */
	public constructor(interaction: APIChatInputApplicationCommandInteraction) {
		this.data =
			"options" in interaction.data ? (interaction.data.options ?? null) : null;

		this.resolved =
			"resolved" in interaction.data
				? (interaction.data.resolved ?? null)
				: null;

		this.hoistedOptions = this.data;

		// Hoist subcommand group if present
		if (
			this.hoistedOptions?.[0]?.type ===
			ApplicationCommandOptionType.SubcommandGroup
		) {
			this.group = this.hoistedOptions[0].name;
			this.hoistedOptions = this.hoistedOptions[0].options ?? [];
		}

		// Hoist subcommand if present
		if (
			this.hoistedOptions?.[0]?.type === ApplicationCommandOptionType.Subcommand
		) {
			this.subcommand = this.hoistedOptions[0].name;
			this.hoistedOptions = this.hoistedOptions[0].options ?? [];
		}
	}

	/**
	 * Read a named option from the selected subcommand.
	 * @param name - Option name.
	 * @param required - Throw if the option is absent. Defaults to false.
	 * @returns Native option data, or null when optional and absent.
	 */
	public get<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<Required, APIApplicationCommandInteractionDataOption>;
	/**
	 * Read a named option from the selected subcommand.
	 * @param name - Option name.
	 * @param required - Throw if the option is absent. Defaults to false.
	 * @returns Native option data, or null when optional and absent.
	 */
	public get(
		name: string,
		required = false,
	): APIApplicationCommandInteractionDataOption | null {
		const option = this.hoistedOptions?.find((opt) => opt.name === name);
		if (!option) {
			if (required) {
				throw new Error(`Missing required option "${name}"`);
			}

			return null;
		}

		return option;
	}

	/**
	 * Read the selected subcommand name.
	 * @param required - Defaults to true at runtime, despite the generic overload’s false default. Pass false to allow
	 * absence.
	 * @returns The name, or null when optional and absent.
	 * @throws If required and no subcommand was selected.
	 */
	public getSubcommand<Required extends boolean = false>(
		required?: Required,
	): RequiredIf<Required, string>;
	/**
	 * Read the selected subcommand name.
	 * @param required - Defaults to true at runtime, despite the generic overload’s false default. Pass false to allow
	 * absence.
	 * @returns The name, or null when optional and absent.
	 * @throws If required and no subcommand was selected.
	 */
	public getSubcommand(required = true): string | null {
		if (required && !this.subcommand) {
			throw new Error("A subcommand was not selected");
		}

		return this.subcommand;
	}

	/**
	 * Read the selected subcommand group name.
	 * @param required - Defaults to true at runtime, despite the generic overload’s false default. Pass false to allow
	 * absence.
	 * @returns The name, or null when optional and absent.
	 * @throws If required and no group was selected.
	 */
	public getSubcommandGroup<Required extends boolean = false>(
		required?: Required,
	): RequiredIf<Required, string>;
	/**
	 * Read the selected subcommand group name.
	 * @param required - Defaults to true at runtime, despite the generic overload’s false default. Pass false to allow
	 * absence.
	 * @returns The name, or null when optional and absent.
	 * @throws If required and no group was selected.
	 */
	public getSubcommandGroup(required = true): string | null {
		if (required && !this.group) {
			throw new Error("A subcommand group was not selected");
		}

		return this.group;
	}

	/**
	 * Read a boolean option.
	 * @param name - Option name.
	 * @param required - Throw if absent. Defaults to false.
	 * @returns The native value, or null when optional and absent.
	 * @throws For a missing required option or a mismatched type.
	 */
	public getBoolean<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<Required, boolean>;
	/**
	 * Read a boolean option.
	 * @param name - Option name.
	 * @param required - Throw if absent. Defaults to false.
	 * @returns The native value, or null when optional and absent.
	 * @throws For a missing required option or a mismatched type.
	 */
	public getBoolean(name: string, required = false): boolean | null {
		const option = this.getTypedOption(
			name,
			ApplicationCommandOptionType.Boolean,
			required,
		);
		return option?.value ?? null;
	}

	/**
	 * Read a channel option from native resolved data.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved channel data, or null for an absent optional option. Missing resolved channel data also returns null.
	 * @throws For a missing required option or a mismatched type.
	 */
	public getChannel<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<Required, APIInteractionDataResolvedChannel>;
	/**
	 * Read a channel option from native resolved data.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved channel data, or null for an absent optional option. Missing resolved channel data also returns null.
	 * @throws For a missing required option or a mismatched type.
	 */
	public getChannel(
		name: string,
		required = false,
	): APIInteractionDataResolvedChannel | null {
		const option = this.getTypedOption(
			name,
			ApplicationCommandOptionType.Channel,
			required,
		);
		return option && this.resolved && "channels" in this.resolved
			? (this.resolved.channels?.[option.value] ?? null)
			: null;
	}

	/**
	 * Read a string option.
	 * @param name - Option name.
	 * @param required - Throw if absent. Defaults to false.
	 * @returns The native value, or null when optional and absent.
	 * @throws For a missing required option or a mismatched type.
	 */
	public getString<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<Required, string>;
	/**
	 * Read a string option.
	 * @param name - Option name.
	 * @param required - Throw if absent. Defaults to false.
	 * @returns The native value, or null when optional and absent.
	 * @throws For a missing required option or a mismatched type.
	 */
	public getString(name: string, required = false): string | null {
		const option = this.getTypedOption(
			name,
			ApplicationCommandOptionType.String,
			required,
		);
		return option?.value ?? null;
	}

	/**
	 * Read a integer number option.
	 * @param name - Option name.
	 * @param required - Throw if absent. Defaults to false.
	 * @returns The native value, or null when optional and absent.
	 * @throws For a missing required option or a mismatched type.
	 */
	public getInteger<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<Required, number>;
	/**
	 * Read a integer number option.
	 * @param name - Option name.
	 * @param required - Throw if absent. Defaults to false.
	 * @returns The native value, or null when optional and absent.
	 * @throws For a missing required option or a mismatched type.
	 */
	public getInteger(name: string, required = false): number | null {
		const option = this.getTypedOption(
			name,
			ApplicationCommandOptionType.Integer,
			required,
		);
		return (option?.value as number | null) ?? null;
	}

	/**
	 * Read a number option.
	 * @param name - Option name.
	 * @param required - Throw if absent. Defaults to false.
	 * @returns The native value, or null when optional and absent.
	 * @throws For a missing required option or a mismatched type.
	 */
	public getNumber<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<Required, number>;
	/**
	 * Read a number option.
	 * @param name - Option name.
	 * @param required - Throw if absent. Defaults to false.
	 * @returns The native value, or null when optional and absent.
	 * @throws For a missing required option or a mismatched type.
	 */
	public getNumber(name: string, required = false): number | null {
		const option = this.getTypedOption(
			name,
			ApplicationCommandOptionType.Number,
			required,
		);
		return (option?.value as number | null) ?? null;
	}

	/**
	 * Read a user option from native resolved data.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved user data, or null for an absent optional option. Missing resolved entries may return undefined
	 * despite the declared return type.
	 * @throws For a missing required option or a mismatched type. Missing resolved tables can also throw.
	 */
	public getUser<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<Required, APIUser>;
	/**
	 * Read a user option from native resolved data.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved user data, or null for an absent optional option. Missing resolved entries may return undefined
	 * despite the declared return type.
	 * @throws For a missing required option or a mismatched type. Missing resolved tables can also throw.
	 */
	public getUser(name: string, required = false): APIUser | null {
		const option = this.getTypedOption(
			name,
			ApplicationCommandOptionType.User,
			required,
		);
		return option?.value ? this.resolved!.users![option.value] : null;
	}

	/**
	 * Read a guild member option from native resolved data.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved guild member data, or null for an absent optional option. Missing resolved entries may return
	 * undefined despite the declared return type.
	 * @throws For a missing required option or a mismatched type. Missing resolved tables can also throw.
	 */
	public getMember<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<Required, APIInteractionDataResolvedGuildMember>;

	/**
	 * Read a guild member option from native resolved data.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved guild member data, or null for an absent optional option. Missing resolved entries may return
	 * undefined despite the declared return type.
	 * @throws For a missing required option or a mismatched type. Missing resolved tables can also throw.
	 */
	public getMember(
		name: string,
		required = false,
	): APIInteractionDataResolvedGuildMember | null {
		const option = this.getTypedOption(
			name,
			ApplicationCommandOptionType.User,
			required,
		);
		return option?.value ? this.resolved!.members![option.value] : null;
	}

	/**
	 * Read a role option from native resolved data.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved role data, or null for an absent optional option. Missing resolved entries may return undefined
	 * despite the declared return type.
	 * @throws For a missing required option or a mismatched type. Missing resolved tables can also throw.
	 */
	public getRole<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<Required, APIRole>;
	/**
	 * Read a role option from native resolved data.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved role data, or null for an absent optional option. Missing resolved entries may return undefined
	 * despite the declared return type.
	 * @throws For a missing required option or a mismatched type. Missing resolved tables can also throw.
	 */
	public getRole(name: string, required = false): APIRole | null {
		const option = this.getTypedOption(
			name,
			ApplicationCommandOptionType.Role,
			required,
		);
		return option?.value ? this.resolved!.roles![option.value] : null;
	}

	/**
	 * Read a attachment option from native resolved data.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved attachment data, or null for an absent optional option. Missing resolved entries may return undefined
	 * despite the declared return type.
	 * @throws For a missing required option or a mismatched type. Missing resolved tables can also throw.
	 */
	public getAttachment<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<Required, APIAttachment>;
	/**
	 * Read a attachment option from native resolved data.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved attachment data, or null for an absent optional option. Missing resolved entries may return undefined
	 * despite the declared return type.
	 * @throws For a missing required option or a mismatched type. Missing resolved tables can also throw.
	 */
	public getAttachment(name: string, required = false): APIAttachment | null {
		const option = this.getTypedOption(
			name,
			ApplicationCommandOptionType.Attachment,
			required,
		);
		return option?.value ? this.resolved!.attachments![option.value] : null;
	}

	/**
	 * Read a mentionable option as a resolved member, user, or role, in that order.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved data, or null if no data is available, even with required: true.
	 * @throws For a missing required option or a mismatched option type.
	 */
	public getMentionable<Required extends boolean = false>(
		name: string,
		required?: Required,
	): RequiredIf<
		Required,
		APIUser | APIInteractionDataResolvedGuildMember | APIRole
	>;

	/**
	 * Read a mentionable option as a resolved member, user, or role, in that order.
	 * @param name - Option name.
	 * @param required - Require the option itself. Defaults to false.
	 * @returns Resolved data, or null if no data is available, even with required: true.
	 * @throws For a missing required option or a mismatched option type.
	 */
	public getMentionable(
		name: string,
		required = false,
	): APIUser | APIInteractionDataResolvedGuildMember | APIRole | null {
		const option = this.getTypedOption(
			name,
			ApplicationCommandOptionType.Mentionable,
			required,
		);

		if (!option || !this.resolved) {
			return null;
		}

		if (
			"members" in this.resolved &&
			this.resolved.members &&
			option.value in this.resolved.members
		) {
			return this.resolved.members[option.value] ?? null;
		}

		if (
			"users" in this.resolved &&
			this.resolved.users &&
			option.value in this.resolved.users
		) {
			return this.resolved.users[option.value] ?? null;
		}

		if (
			"roles" in this.resolved &&
			this.resolved.roles &&
			option.value in this.resolved.roles
		) {
			return this.resolved.roles[option.value] ?? null;
		}

		return null;
	}

	private getTypedOption<
		Option extends BasicApplicationCommandOptionType,
		Required extends boolean = false,
	>(
		name: string,
		type: Option,
		required: Required,
	): RequiredIf<Required, TypeToOptionMap[Option]>;

	private getTypedOption<Option extends BasicApplicationCommandOptionType>(
		name: string,
		type: Option,
		required: boolean,
	): TypeToOptionMap[Option] | null {
		const option = this.get(name, required);
		if (!option) {
			return null;
		} else if (option.type !== type) {
			throw new Error(`Option with name "${name}" is not of the correct type`);
		}

		return option as TypeToOptionMap[Option];
	}
}
