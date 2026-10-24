import {
	type APIAttachment,
	type APIInteractionDataResolved,
	type APIInteractionDataResolvedChannel,
	type APIInteractionDataResolvedGuildMember,
	type APIModalSubmitInteraction,
	type APIRole,
	type APIUser,
	ComponentType,
	type ModalSubmitComponent,
} from "discord-api-types/v10";
import type { ModalComponentType, TypeToModalComponentMap } from "./util";

/** Service class for resolving (modal) interaction options while working with the raw API. Based on {@linkplain https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/structures/CommandInteractionOptionResolver.js} */
export class ModalInteractionOptionResolver {
	/** The interaction resolved data */
	private readonly resolved: APIInteractionDataResolved | null = null;

	/** Bottom-level components from the modal submission */
	private readonly hoistedComponents: ModalSubmitComponent[];

	/**
	 * Read a native Discord modal submission payload without HTTP requests.
	 * @param interaction - Native API interaction payload, including any resolved entity tables.
	 */
	public constructor(interaction: APIModalSubmitInteraction) {
		this.resolved =
			"resolved" in interaction.data
				? (interaction.data.resolved ?? null)
				: null;

		this.hoistedComponents = interaction.data.components.flatMap(
			(component) => {
				// Action rows
				if ("components" in component) {
					return component.components;
				}

				// Labels and whatever else
				if ("component" in component) {
					return [component.component];
				}

				// Uhh... unsupported
				return [];
			},
		);
	}

	/** Get a component. */
	public get(customId: string): ModalSubmitComponent {
		const component = this.hoistedComponents.find(
			(c) => c.custom_id === customId,
		);
		if (!component) {
			throw new Error(`Component with custom ID "${customId}" not found.`);
		}

		return component;
	}

	/** Get a text input component. */
	public getTextInput(customId: string): string {
		return this.getTyped(customId, ComponentType.TextInput).value;
	}

	/** Get a string select component. */
	public getSelectedStrings(customId: string): string[] {
		return this.getTyped(customId, ComponentType.StringSelect).values;
	}

	/** Get selected users. */
	public getSelectedUsers(customId: string): APIUser[] {
		const component = this.getTyped(customId, ComponentType.UserSelect);
		return component.values.map((userId) => this.resolved!.users![userId]!);
	}

	/** Get selected roles. */
	public getSelectedRoles(customId: string): APIRole[] {
		const component = this.getTyped(customId, ComponentType.RoleSelect);
		return component.values.map((roleId) => this.resolved!.roles![roleId]!);
	}

	/** Get selected channels. */
	public getSelectedChannels(
		customId: string,
	): APIInteractionDataResolvedChannel[] {
		const component = this.getTyped(customId, ComponentType.ChannelSelect);
		return component.values.map(
			(channelId) => this.resolved!.channels![channelId]!,
		);
	}

	/** Get selected members. */
	public getSelectedMembers(
		customId: string,
	): APIInteractionDataResolvedGuildMember[] {
		const component = this.getTyped(customId, ComponentType.UserSelect);
		return component.values.map(
			(memberId) => this.resolved!.members![memberId]!,
		);
	}

	/** Get selected mentionables. */
	public getSelectedMentionables(customId: string): (APIUser | APIRole)[] {
		const component = this.getTyped(customId, ComponentType.MentionableSelect);
		return component.values.map((id) => {
			if (this.resolved!.users && id in this.resolved!.users) {
				return this.resolved!.users![id]!;
			}

			return this.resolved!.roles![id]!;
		});
	}

	/** Get attachments. */
	public getAttachments(customId: string): APIAttachment[] {
		const component = this.getTyped(customId, ComponentType.FileUpload);
		return component.values.map((id) => this.resolved!.attachments![id]!);
	}

	private getTyped<AllowedType extends ModalComponentType>(
		customId: string,
		allowedType: AllowedType,
	): TypeToModalComponentMap[AllowedType] {
		const component = this.get(customId);
		if (component.type !== allowedType) {
			throw new Error(
				`Component with custom ID "${customId}" is not one of the allowed type: ${allowedType}.`,
			);
		}

		return component as TypeToModalComponentMap[AllowedType];
	}
}
