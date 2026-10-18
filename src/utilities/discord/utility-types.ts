import type {
	APIChannel,
	APIThreadChannel,
	APIGuildVoiceChannel,
	APIGuildStageVoiceChannel,
} from "discord-api-types/v10";
import { ChannelType } from "discord-api-types/v10";
import type {
	InteractionContext,
	CommandInteraction,
	AutocompleteInteraction,
	ButtonInteraction,
	SelectMenuInteraction,
	RepliableInteraction,
} from "../../discord/InteractionContext";

/** Native channels described by discord-api-types. */
export type ChannelTypes = APIChannel;
export type TextBasedChannelTypes = Extract<
	APIChannel,
	{
		type:
			| ChannelType.DM
			| ChannelType.GroupDM
			| ChannelType.GuildText
			| ChannelType.GuildAnnouncement
			| ChannelType.GuildVoice
			| ChannelType.GuildStageVoice
			| ChannelType.PublicThread
			| ChannelType.PrivateThread
			| ChannelType.AnnouncementThread;
	}
>;
export type VoiceBasedChannelTypes =
	APIGuildVoiceChannel | APIGuildStageVoiceChannel;
export type GuildBasedChannelTypes = Exclude<
	APIChannel,
	{ type: ChannelType.DM | ChannelType.GroupDM }
>;
export type NonThreadGuildBasedChannelTypes = Exclude<
	GuildBasedChannelTypes,
	APIThreadChannel
>;
export type GuildTextBasedChannelTypes = Extract<
	TextBasedChannelTypes,
	GuildBasedChannelTypes
>;
export type NonThreadGuildTextBasedChannelTypes = Exclude<
	GuildTextBasedChannelTypes,
	APIThreadChannel
>;
export type ChannelTypeString = ChannelTypes["type"] | "UNKNOWN";
export type ChatInputOrContextMenuCommandInteraction = CommandInteraction;
export type NonModalInteraction =
	| CommandInteraction
	| AutocompleteInteraction
	| SelectMenuInteraction
	| ButtonInteraction;
export type AnyInteraction = InteractionContext;
export type AnyInteractableInteraction = RepliableInteraction;
