import type {
	Channel,
	TextBasedChannel,
	VoiceBasedChannel,
	GuildBasedChannel,
	NonThreadGuildBasedChannel,
	GuildTextBasedChannel,
	ThreadChannel,
	CommandInteraction,
	AutocompleteInteraction,
	ButtonInteraction,
	AnySelectMenuInteraction,
	BaseInteraction,
	RepliableInteraction,
} from "discord.js";
export type ChannelTypes = Channel;
export type TextBasedChannelTypes = TextBasedChannel;
export type VoiceBasedChannelTypes = VoiceBasedChannel;
export type GuildBasedChannelTypes = GuildBasedChannel;
export type NonThreadGuildBasedChannelTypes = NonThreadGuildBasedChannel;
export type GuildTextBasedChannelTypes = GuildTextBasedChannel;
export type NonThreadGuildTextBasedChannelTypes = Exclude<
	GuildTextBasedChannel,
	ThreadChannel
>;
export type ChannelTypeString = Channel["type"] | "UNKNOWN";
export type ChatInputOrContextMenuCommandInteraction = CommandInteraction;
export type NonModalInteraction =
	| CommandInteraction
	| AutocompleteInteraction
	| AnySelectMenuInteraction
	| ButtonInteraction;
export type AnyInteraction = BaseInteraction;
export type AnyInteractableInteraction = RepliableInteraction;
