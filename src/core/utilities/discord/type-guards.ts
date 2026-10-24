import {
	ChannelType,
	type Channel,
	type Attachment,
	type Message,
	GuildMember,
	type APIInteractionGuildMember,
	type APIInteractionDataResolvedGuildMember,
	type CategoryChannel,
	type DMChannel,
	type PartialGroupDMChannel,
	type NewsChannel,
	type TextChannel,
	type VoiceChannel,
	type StageChannel,
	type ThreadChannel,
	type PublicThreadChannel,
	type PrivateThreadChannel,
} from "discord.js";
import { BaseInteraction as InteractionContext } from "discord.js";
import { Message as MessageContext } from "discord.js";
import type { Nullish } from "../../../util/general";
import type {
	AnyInteractableInteraction,
	GuildBasedChannelTypes,
	TextBasedChannelTypes,
	VoiceBasedChannelTypes,
} from "./utility-types";

export function isCategoryChannel(
	channel: Channel | Nullish,
): channel is CategoryChannel {
	return channel?.type === ChannelType.GuildCategory;
}
export function isDMChannel(channel: Channel | Nullish): channel is DMChannel {
	return channel?.type === ChannelType.DM;
}
export function isGroupChannel(
	channel: Channel | Nullish,
): channel is PartialGroupDMChannel {
	return channel?.type === ChannelType.GroupDM;
}
export function isGuildBasedChannel(
	channel: Channel | Nullish,
): channel is GuildBasedChannelTypes {
	return (
		channel !== null &&
		channel !== undefined &&
		channel.type !== ChannelType.DM &&
		channel.type !== ChannelType.GroupDM
	);
}
export function isGuildBasedChannelByGuildKey(
	channel: Channel | Nullish,
): channel is GuildBasedChannelTypes {
	return (
		isGuildBasedChannel(channel) &&
		"guildId" in channel &&
		typeof channel.guildId === "string"
	);
}
export function isNewsChannel(
	channel: Channel | Nullish,
): channel is NewsChannel {
	return channel?.type === ChannelType.GuildAnnouncement;
}
export function isTextChannel(
	channel: Channel | Nullish,
): channel is TextChannel {
	return channel?.type === ChannelType.GuildText;
}
export function isVoiceChannel(
	channel: Channel | Nullish,
): channel is VoiceChannel {
	return channel?.type === ChannelType.GuildVoice;
}
export function isStageChannel(
	channel: Channel | Nullish,
): channel is StageChannel {
	return channel?.type === ChannelType.GuildStageVoice;
}
export function isThreadChannel(
	channel: Channel | Nullish,
): channel is Extract<Channel, ThreadChannel> {
	return (
		channel !== null &&
		channel !== undefined &&
		[
			ChannelType.PublicThread,
			ChannelType.PrivateThread,
			ChannelType.AnnouncementThread,
		].includes(channel.type)
	);
}
export function isNewsThreadChannel(
	channel: Channel | Nullish,
): channel is PublicThreadChannel {
	return channel?.type === ChannelType.AnnouncementThread;
}
export function isPublicThreadChannel(
	channel: Channel | Nullish,
): channel is PublicThreadChannel {
	return channel?.type === ChannelType.PublicThread;
}
export function isPrivateThreadChannel(
	channel: Channel | Nullish,
): channel is PrivateThreadChannel {
	return channel?.type === ChannelType.PrivateThread;
}
/** Whether this native channel supports the framework's message helpers. */
export function isTextBasedChannel(
	channel: Channel | Nullish,
): channel is Exclude<
	TextBasedChannelTypes,
	PartialGroupDMChannel | StageChannel
> {
	return (
		isDMChannel(channel) ||
		isTextChannel(channel) ||
		isNewsChannel(channel) ||
		isVoiceChannel(channel) ||
		isThreadChannel(channel)
	);
}
export function isVoiceBasedChannel(
	channel: Channel | Nullish,
): channel is VoiceBasedChannelTypes {
	return isVoiceChannel(channel) || isStageChannel(channel);
}
/** Thread NSFW status comes from its cached parent; an unavailable parent yields false. */
export function isNsfwChannel(channel: Channel | Nullish): boolean {
	if (!channel) return false;
	if (isThreadChannel(channel)) {
		const parent = channel.parent;
		return parent && "nsfw" in parent ? parent.nsfw === true : false;
	}
	return "nsfw" in channel && channel.nsfw === true;
}
export function isMessageInstance(
	message: Message | MessageContext,
): message is MessageContext {
	return message instanceof MessageContext;
}
export function isAnyInteraction(
	target: Message | MessageContext | InteractionContext,
): target is InteractionContext {
	return target instanceof InteractionContext;
}
export function isAnyInteractableInteraction(
	target: Message | MessageContext | InteractionContext,
): target is AnyInteractableInteraction {
	return isAnyInteraction(target) && target.isRepliable();
}
/** Whether a native member includes its user, as full member fetches do. */
export function isGuildMember(
	member:
		| GuildMember
		| APIInteractionGuildMember
		| APIInteractionDataResolvedGuildMember
		| Nullish,
): member is GuildMember {
	return !!member && member instanceof GuildMember;
}
export function isMediaAttachment(attachment: Attachment): boolean {
	return (
		!!attachment.contentType &&
		(attachment.contentType.startsWith("audio/") ||
			((attachment.contentType.startsWith("image/") ||
				attachment.contentType.startsWith("video/")) &&
				hasDimensionsDefined(attachment)))
	);
}
export function isImageAttachment(attachment: Attachment): boolean {
	return (
		!!attachment.contentType?.startsWith("image/") &&
		hasDimensionsDefined(attachment)
	);
}
function hasDimensionsDefined(attachment: Attachment): boolean {
	return !!attachment.width && !!attachment.height;
}
