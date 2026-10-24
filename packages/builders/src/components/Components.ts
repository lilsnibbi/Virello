import type {
	APIActionRowComponent,
	APIBaseComponent,
	APIButtonComponent,
	APIChannelSelectComponent,
	APIComponentInActionRow,
	APIContainerComponent,
	APIFileComponent,
	APIFileUploadComponent,
	APIRadioGroupComponent,
	APICheckboxGroupComponent,
	APILabelComponent,
	APIMediaGalleryComponent,
	APIMentionableSelectComponent,
	APIMessageComponent,
	APIModalComponent,
	APIRoleSelectComponent,
	APISectionAccessoryComponent,
	APISectionComponent,
	APISeparatorComponent,
	APIStringSelectComponent,
	APITextDisplayComponent,
	APITextInputComponent,
	APIThumbnailComponent,
	APIUserSelectComponent,
} from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { ActionRowBuilder } from "./ActionRow";
import { ButtonBuilder } from "./button/ButtonBuilder";
import type {
	DangerButtonBuilder,
	PrimaryButtonBuilder,
	SecondaryButtonBuilder,
	SuccessButtonBuilder,
} from "./button/CustomIdButton";
import { ComponentBuilder } from "./Component";

export { ButtonBuilder };

import { LinkButtonBuilder } from "./button/LinkButton";
import { PremiumButtonBuilder } from "./button/PremiumButton";
import { FileUploadBuilder } from "./fileUpload/FileUpload";
import { RadioGroupBuilder } from "./radioGroup/RadioGroup";
import { CheckboxGroupBuilder } from "./checkboxGroup/CheckboxGroup";
import { LabelBuilder } from "./label/Label";
import { ChannelSelectMenuBuilder } from "./selectMenu/ChannelSelectMenu";
import { MentionableSelectMenuBuilder } from "./selectMenu/MentionableSelectMenu";
import { RoleSelectMenuBuilder } from "./selectMenu/RoleSelectMenu";
import { StringSelectMenuBuilder } from "./selectMenu/StringSelectMenu";
import { UserSelectMenuBuilder } from "./selectMenu/UserSelectMenu";
import { TextInputBuilder } from "./textInput/TextInput";
import { ContainerBuilder } from "./v2/Container";
import { FileBuilder } from "./v2/File";
import { MediaGalleryBuilder } from "./v2/MediaGallery";
import { SectionBuilder } from "./v2/Section";
import { SeparatorBuilder } from "./v2/Separator";
import { TextDisplayBuilder } from "./v2/TextDisplay";
import { ThumbnailBuilder } from "./v2/Thumbnail";

/**
 * The builders that may be used as top-level components on messages
 */
export type MessageTopLevelComponentBuilder =
	| ActionRowBuilder
	| ContainerBuilder
	| FileBuilder
	| MediaGalleryBuilder
	| SectionBuilder
	| SeparatorBuilder
	| TextDisplayBuilder;

/**
 * The builders that may be used for messages.
 */
export type MessageComponentBuilder =
	| MessageActionRowComponentBuilder
	| MessageTopLevelComponentBuilder
	| ThumbnailBuilder;

/**
 * The builders that may be used for modals.
 */
export type ModalComponentBuilder =
	| ActionRowBuilder
	| FileUploadBuilder
	| RadioGroupBuilder
	| CheckboxGroupBuilder
	| LabelBuilder
	| ModalActionRowComponentBuilder;

// Any button builder is already covered by the ButtonBuilder class

/**
 * The builders that may be used within an action row for messages.
 */
export type MessageActionRowComponentBuilder =
	| ButtonBuilder
	| PrimaryButtonBuilder
	| SecondaryButtonBuilder
	| SuccessButtonBuilder
	| DangerButtonBuilder
	| LinkButtonBuilder
	| PremiumButtonBuilder
	| ChannelSelectMenuBuilder
	| MentionableSelectMenuBuilder
	| RoleSelectMenuBuilder
	| StringSelectMenuBuilder
	| UserSelectMenuBuilder;

/**
 * The builders that may be used within an action row for modals.
 */
export type ModalActionRowComponentBuilder = TextInputBuilder;

/**
 * Any action row component builder.
 */
export type AnyActionRowComponentBuilder =
	MessageActionRowComponentBuilder | ModalActionRowComponentBuilder;

/**
 * Any modal component builder.
 */
export type AnyModalComponentBuilder =
	FileUploadBuilder | LabelBuilder | TextDisplayBuilder;

/**
 * Components here are mapped to their respective builder.
 */
export interface MappedComponentTypes {
	/**
	 * The action row component type is associated with an {@link ActionRowBuilder}.
	 */
	[ComponentType.ActionRow]: ActionRowBuilder;
	/**
	 * The button component type is associated with a {@link BaseButtonBuilder}.
	 */
	[ComponentType.Button]: ButtonBuilder;
	/**
	 * The string select component type is associated with a {@link StringSelectMenuBuilder}.
	 */
	[ComponentType.StringSelect]: StringSelectMenuBuilder;
	/**
	 * The text input component type is associated with a {@link TextInputBuilder}.
	 */
	[ComponentType.TextInput]: TextInputBuilder;
	/**
	 * The user select component type is associated with a {@link UserSelectMenuBuilder}.
	 */
	[ComponentType.UserSelect]: UserSelectMenuBuilder;
	/**
	 * The role select component type is associated with a {@link RoleSelectMenuBuilder}.
	 */
	[ComponentType.RoleSelect]: RoleSelectMenuBuilder;
	/**
	 * The mentionable select component type is associated with a {@link MentionableSelectMenuBuilder}.
	 */
	[ComponentType.MentionableSelect]: MentionableSelectMenuBuilder;
	/**
	 * The channel select component type is associated with a {@link ChannelSelectMenuBuilder}.
	 */
	[ComponentType.ChannelSelect]: ChannelSelectMenuBuilder;
	/**
	 * The thumbnail component type is associated with a {@link ThumbnailBuilder}.
	 */
	[ComponentType.Thumbnail]: ThumbnailBuilder;
	/**
	 * The file component type is associated with a {@link FileBuilder}.
	 */
	[ComponentType.File]: FileBuilder;
	/**
	 * The separator component type is associated with a {@link SeparatorBuilder}.
	 */
	[ComponentType.Separator]: SeparatorBuilder;
	/**
	 * The text display component type is associated with a {@link TextDisplayBuilder}.
	 */
	[ComponentType.TextDisplay]: TextDisplayBuilder;
	/**
	 * The media gallery component type is associated with a {@link MediaGalleryBuilder}.
	 */
	[ComponentType.MediaGallery]: MediaGalleryBuilder;
	/**
	 * The section component type is associated with a {@link SectionBuilder}.
	 */
	[ComponentType.Section]: SectionBuilder;
	/**
	 * The container component type is associated with a {@link ContainerBuilder}.
	 */
	[ComponentType.Container]: ContainerBuilder;
	/**
	 * The label component type is associated with a {@link LabelBuilder}.
	 */
	[ComponentType.Label]: LabelBuilder;
	/**
	 * The file upload component type is associated with a {@link FileUploadBuilder}.
	 */
	[ComponentType.FileUpload]: FileUploadBuilder;
	/** Single-choice modal control, placed inside a label. */
	[ComponentType.RadioGroup]: RadioGroupBuilder;
	/** Multiple-choice modal control, placed inside a label. */
	[ComponentType.CheckboxGroup]: CheckboxGroupBuilder;
}

/**
 * Factory for creating components from API data.
 *
 * @typeParam ComponentType - The type of component to use
 * @param data - The API data to transform to a component class
 */
export function createComponentBuilder<
	ComponentType extends keyof MappedComponentTypes,
>(
	data: (APIModalComponent | APIMessageComponent) & { type: ComponentType },
): MappedComponentTypes[ComponentType];

/**
 * Factory for creating components from API data.
 *
 * @typeParam Builder - The type of component to use
 * @param data - The API data to transform to a component class
 */
export function createComponentBuilder<
	Builder extends MessageComponentBuilder | ModalComponentBuilder,
>(data: Builder): Builder;

export function createComponentBuilder(
	data: APIMessageComponent | APIModalComponent | MessageComponentBuilder,
): ComponentBuilder<APIBaseComponent<ComponentType>> {
	if (
		data instanceof ComponentBuilder ||
		(typeof data === "object" && data !== null && "toJSON" in data)
	) {
		return data as unknown as ComponentBuilder<APIBaseComponent<ComponentType>>;
	}

	const rawData = data as APIMessageComponent | APIModalComponent;
	switch (rawData.type) {
		case ComponentType.ActionRow:
			return new ActionRowBuilder(
				rawData as APIActionRowComponent<APIComponentInActionRow>,
			);
		case ComponentType.Button:
			return createButtonBuilder(
				rawData as APIButtonComponent,
			) as unknown as MessageComponentBuilder;
		case ComponentType.StringSelect:
			return new StringSelectMenuBuilder(rawData as APIStringSelectComponent);
		case ComponentType.TextInput:
			return new TextInputBuilder(rawData as APITextInputComponent);
		case ComponentType.UserSelect:
			return new UserSelectMenuBuilder(rawData as APIUserSelectComponent);
		case ComponentType.RoleSelect:
			return new RoleSelectMenuBuilder(rawData as APIRoleSelectComponent);
		case ComponentType.MentionableSelect:
			return new MentionableSelectMenuBuilder(
				rawData as APIMentionableSelectComponent,
			);
		case ComponentType.ChannelSelect:
			return new ChannelSelectMenuBuilder(rawData as APIChannelSelectComponent);
		case ComponentType.Thumbnail:
			return new ThumbnailBuilder(rawData as APIThumbnailComponent);
		case ComponentType.File:
			return new FileBuilder(rawData as APIFileComponent);
		case ComponentType.Separator:
			return new SeparatorBuilder(rawData as APISeparatorComponent);
		case ComponentType.TextDisplay:
			return new TextDisplayBuilder(rawData as APITextDisplayComponent);
		case ComponentType.MediaGallery:
			return new MediaGalleryBuilder(rawData as APIMediaGalleryComponent);
		case ComponentType.Section:
			return new SectionBuilder(rawData as APISectionComponent);
		case ComponentType.Container:
			return new ContainerBuilder(rawData as APIContainerComponent);
		case ComponentType.Label:
			return new LabelBuilder(rawData as APILabelComponent);
		case ComponentType.FileUpload:
			return new FileUploadBuilder(rawData as APIFileUploadComponent);
		case ComponentType.RadioGroup:
			return new RadioGroupBuilder(rawData as APIRadioGroupComponent);
		case ComponentType.CheckboxGroup:
			return new CheckboxGroupBuilder(rawData as APICheckboxGroupComponent);
		default:
			// This case can still occur if we get a newer unsupported component type
			throw new Error(
				`Cannot properly serialize component type: ${rawData.type}`,
			);
	}
}

function createButtonBuilder(data: APIButtonComponent): ButtonBuilder {
	return new ButtonBuilder(data);
}

export function resolveAccessoryComponent(
	component: APISectionAccessoryComponent,
) {
	switch (component.type) {
		case ComponentType.Button:
			return createButtonBuilder(component);
		case ComponentType.Thumbnail:
			return new ThumbnailBuilder(component);
		default: {
			const unknownComponent = component as { type: number };
			throw new Error(
				`Cannot properly serialize section accessory component: ${unknownComponent.type}`,
			);
		}
	}
}
