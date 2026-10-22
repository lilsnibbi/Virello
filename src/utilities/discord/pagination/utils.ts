import { ActionRowBuilder } from "../../../builders/components/ActionRow";
import { ButtonBuilder } from "../../../builders/components/button/ButtonBuilder";
import { type MessageActionRowComponentBuilder } from "../../../builders/components/Components";
import {
	type APIComponentInMessageActionRow as ActionRowComponentOptions,
	type APIActionRowComponent,
	type APIButtonComponent,
	type APIComponentInMessageActionRow,
	type APIButtonComponent as ButtonComponentData,
	type APIChannelSelectComponent as ChannelSelectMenuComponentData,
	type APIMentionableSelectComponent as MentionableSelectMenuComponentData,
	type APIRoleSelectComponent as RoleSelectMenuComponentData,
	type APIStringSelectComponent as StringSelectMenuComponentData,
	type APIUserSelectComponent as UserSelectMenuComponentData,
	ButtonStyle,
	ComponentType,
} from "discord-api-types/v10";
import type {
	MessageEditBody as MessageEditOptions,
	MessageBody as MessageReplyOptions,
} from "../../../discord/payloads";
import { chunk, partition } from "../../index";
import {
	isAnyInteractableInteraction,
	isMessageInstance,
} from "../type-guards";
import type {
	PaginatedMessageAction,
	PaginatedMessageActionButton,
	PaginatedMessageActionChannelMenu,
	PaginatedMessageActionLink,
	PaginatedMessageActionMentionableMenu,
	PaginatedMessageActionRoleMenu,
	PaginatedMessageActionStringMenu,
	PaginatedMessageActionUserMenu,
	PaginatedMessageComponentUnion,
	SafeReplyToInteractionParameters,
} from "./PaginatedMessageTypes";

/** Check if a PaginatedMessageAction is a button or menu. */
export function actionIsButtonOrMenu(
	action: PaginatedMessageAction,
): action is Exclude<PaginatedMessageAction, PaginatedMessageActionLink> {
	return (
		action.type === ComponentType.Button ||
		action.type === ComponentType.StringSelect ||
		action.type === ComponentType.UserSelect ||
		action.type === ComponentType.RoleSelect ||
		action.type === ComponentType.MentionableSelect ||
		action.type === ComponentType.ChannelSelect
	);
}

/** Check if a PaginatedMessageAction is a button with {@link ButtonStyle.Link style `link`}. */
export function actionIsLinkButton(
	action: PaginatedMessageAction,
): action is PaginatedMessageActionLink {
	return (
		action.type === ComponentType.Button && action.style === ButtonStyle.Link
	);
}

/** Check if the given interaction is a button interaction. */
export function isMessageButtonInteractionData(
	interaction: ActionRowComponentOptions,
): interaction is ButtonComponentData {
	return interaction.type === ComponentType.Button;
}

/** Check if the given interaction is a string select interaction. */
export function isMessageStringSelectInteractionData(
	interaction: ActionRowComponentOptions,
): interaction is StringSelectMenuComponentData {
	return interaction.type === ComponentType.StringSelect;
}

/** Check if the given interaction is a user select interaction. */
export function isMessageUserSelectInteractionData(
	interaction: ActionRowComponentOptions,
): interaction is UserSelectMenuComponentData {
	return interaction.type === ComponentType.UserSelect;
}

/** Check if the given interaction is a role select interaction. */
export function isMessageRoleSelectInteractionData(
	interaction: ActionRowComponentOptions,
): interaction is RoleSelectMenuComponentData {
	return interaction.type === ComponentType.RoleSelect;
}

/** Check if the given interaction is a mentionable select interaction. */
export function isMessageMentionableSelectInteractionData(
	interaction: ActionRowComponentOptions,
): interaction is MentionableSelectMenuComponentData {
	return interaction.type === ComponentType.MentionableSelect;
}

/** Check if the given interaction is a channel select interaction. */
export function isMessageChannelSelectInteractionData(
	interaction: ActionRowComponentOptions,
): interaction is ChannelSelectMenuComponentData {
	return interaction.type === ComponentType.ChannelSelect;
}

/** Check if the given component is a button builder. */
export function isButtonComponentBuilder(
	component: MessageActionRowComponentBuilder,
): component is ButtonBuilder {
	return component.toJSON().type === ComponentType.Button;
}

/** Check if the given action is a paginated message action button. */
export function isActionButton(
	action: PaginatedMessageAction,
): action is PaginatedMessageActionButton {
	return (
		action.type === ComponentType.Button && action.style !== ButtonStyle.Link
	);
}

/** Check if the given action is a paginated message action link. */
export function isActionLink(
	action: PaginatedMessageAction,
): action is PaginatedMessageActionLink {
	return (
		action.type === ComponentType.Button && action.style === ButtonStyle.Link
	);
}

/** Check if the given action is a paginated message action string menu. */
export function isActionStringMenu(
	action: PaginatedMessageAction,
): action is PaginatedMessageActionStringMenu {
	return action.type === ComponentType.StringSelect;
}

/** Check if the given action is a paginated message action user menu. */
export function isActionUserMenu(
	action: PaginatedMessageAction,
): action is PaginatedMessageActionUserMenu {
	return action.type === ComponentType.UserSelect;
}

/** Check if the given action is a paginated message action role menu. */
export function isActionRoleMenu(
	action: PaginatedMessageAction,
): action is PaginatedMessageActionRoleMenu {
	return action.type === ComponentType.RoleSelect;
}

/** Check if the given action is a paginated message action mentionable menu. */
export function isActionMentionableMenu(
	action: PaginatedMessageAction,
): action is PaginatedMessageActionMentionableMenu {
	return action.type === ComponentType.MentionableSelect;
}

/** Check if the given action is a paginated message action channel menu. */
export function isActionChannelMenu(
	action: PaginatedMessageAction,
): action is PaginatedMessageActionChannelMenu {
	return action.type === ComponentType.ChannelSelect;
}

/** Create partitioned message rows based on the provided components. */
export function createPartitionedMessageRow(
	components: MessageActionRowComponentBuilder[],
): PaginatedMessageComponentUnion[] {
	// Partition the components into two groups: buttons and select menus
	const [messageButtons, selectMenus] = partition(
		components,
		isButtonComponentBuilder,
	);
	const [actionButtons, linkButtons] = partition(
		messageButtons,
		(value) =>
			(value.toJSON() as APIButtonComponent).style !== ButtonStyle.Link,
	);

	// Chunk the button components in sets of 5, the maximum of 1 ActionRowBuilder
	const chunkedActionButtonComponents = chunk(actionButtons, 5);

	// Map all the button components to ActionRowBuilders
	const messageActionButtonActionRows = chunkedActionButtonComponents.map(
		(componentsChunk) =>
			new ActionRowBuilder<MessageActionRowComponentBuilder>() //
				.setComponents(componentsChunk),
	);

	// Map all the select menu components to ActionRowBuilders
	const selectMenuActionRows = selectMenus.map((component) =>
		new ActionRowBuilder<MessageActionRowComponentBuilder>() //
			.setComponents(component),
	);

	// Chunk the button components in sets of 5, the maximum of 1 ActionRowBuilder
	const chunkedLinkButtonComponents = chunk(linkButtons, 5);

	// Map all the button components to ActionRowBuilders
	const messageLinkButtonActionRows = chunkedLinkButtonComponents.map(
		(componentsChunk) =>
			new ActionRowBuilder<MessageActionRowComponentBuilder>() //
				.setComponents(componentsChunk),
	);

	return [
		...messageActionButtonActionRows,
		...selectMenuActionRows,
		...messageLinkButtonActionRows,
	].map((actionRow) =>
		actionRow.toJSON(),
	) as APIActionRowComponent<APIComponentInMessageActionRow>[];
}

/** Safely replies to a message or interaction. This is primarily to save duplicated code in the main `PaginatedMessage` class */
export async function safelyReplyToInteraction<T extends "edit" | "reply">(
	parameters: SafeReplyToInteractionParameters<T>,
) {
	if (isAnyInteractableInteraction(parameters.messageOrInteraction)) {
		if (
			parameters.messageOrInteraction.replied ||
			parameters.messageOrInteraction.deferred
		) {
			await parameters.messageOrInteraction.editReply(
				parameters.interactionEditReplyContent,
			);
		} else if (parameters.messageOrInteraction.isMessageComponent()) {
			await parameters.messageOrInteraction.update(
				parameters.componentUpdateContent,
			);
		} else {
			await parameters.messageOrInteraction.reply(
				parameters.interactionReplyContent,
			);
		}
	} else if (
		parameters.messageMethodContent &&
		parameters.messageMethod &&
		isMessageInstance(parameters.messageOrInteraction)
	) {
		await parameters.messageOrInteraction[parameters.messageMethod](
			parameters.messageMethodContent as MessageEditOptions &
				MessageReplyOptions,
		);
	}
}
