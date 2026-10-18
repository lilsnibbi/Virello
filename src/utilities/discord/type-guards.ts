import {
	ChannelType,
	type APIChannel,
	type APIAttachment,
	type APIMessage,
	type APIGuildMember,
	type APIInteractionGuildMember,
	type APIInteractionDataResolvedGuildMember,
	type APIGuildCategoryChannel,
	type APIDMChannel,
	type APIGroupDMChannel,
	type APINewsChannel,
	type APITextChannel,
	type APIGuildVoiceChannel,
	type APIGuildStageVoiceChannel,
	type APIThreadChannel,
	type APIAnnouncementThreadChannel,
	type APIPublicThreadChannel,
	type APIPrivateThreadChannel,
} from "discord-api-types/v10";
import { InteractionContext } from "../../discord/InteractionContext";
import { MessageContext } from "../../discord/MessageContext";
import { container } from "../../core/Container";
import type { Nullish } from "../index";
import type {
	AnyInteractableInteraction,
	GuildBasedChannelTypes,
	TextBasedChannelTypes,
	VoiceBasedChannelTypes,
} from "./utility-types";

export function isCategoryChannel(
	channel: APIChannel | Nullish,
): channel is APIGuildCategoryChannel {
	return channel?.type === ChannelType.GuildCategory;
}
export function isDMChannel(
	channel: APIChannel | Nullish,
): channel is APIDMChannel {
	return channel?.type === ChannelType.DM;
}
export function isGroupChannel(
	channel: APIChannel | Nullish,
): channel is APIGroupDMChannel {
	return channel?.type === ChannelType.GroupDM;
}
export function isGuildBasedChannel(
	channel: APIChannel | Nullish,
): channel is GuildBasedChannelTypes {
	return (
		channel !== null &&
		channel !== undefined &&
		channel.type !== ChannelType.DM &&
		channel.type !== ChannelType.GroupDM
	);
}
export function isGuildBasedChannelByGuildKey(
	channel: APIChannel | Nullish,
): channel is GuildBasedChannelTypes {
	return (
		isGuildBasedChannel(channel) &&
		"guild_id" in channel &&
		typeof channel.guild_id === "string"
	);
}
export function isNewsChannel(
	channel: APIChannel | Nullish,
): channel is APINewsChannel {
	return channel?.type === ChannelType.GuildAnnouncement;
}
export function isTextChannel(
	channel: APIChannel | Nullish,
): channel is APITextChannel {
	return channel?.type === ChannelType.GuildText;
}
export function isVoiceChannel(
	channel: APIChannel | Nullish,
): channel is APIGuildVoiceChannel {
	return channel?.type === ChannelType.GuildVoice;
}
export function isStageChannel(
	channel: APIChannel | Nullish,
): channel is APIGuildStageVoiceChannel {
	return channel?.type === ChannelType.GuildStageVoice;
}
export function isThreadChannel(
	channel: APIChannel | Nullish,
): channel is APIThreadChannel {
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
	channel: APIChannel | Nullish,
): channel is APIAnnouncementThreadChannel {
	return channel?.type === ChannelType.AnnouncementThread;
}
export function isPublicThreadChannel(
	channel: APIChannel | Nullish,
): channel is APIPublicThreadChannel {
	return channel?.type === ChannelType.PublicThread;
}
export function isPrivateThreadChannel(
	channel: APIChannel | Nullish,
): channel is APIPrivateThreadChannel {
	return channel?.type === ChannelType.PrivateThread;
}
/** Whether this native channel supports the framework's message helpers. */
export function isTextBasedChannel(
	channel: APIChannel | Nullish,
): channel is Exclude<
	TextBasedChannelTypes,
	APIGroupDMChannel | APIGuildStageVoiceChannel
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
	channel: APIChannel | Nullish,
): channel is VoiceBasedChannelTypes {
	return isVoiceChannel(channel) || isStageChannel(channel);
}
/** Thread NSFW status comes from its cached parent; an unavailable parent yields false. */
export function isNsfwChannel(channel: APIChannel | Nullish): boolean {
	if (!channel) return false;
	if (isThreadChannel(channel)) {
		const parent = channel.parent_id
			? container.client?.cache.channels.get(channel.parent_id)?.data
			: undefined;
		return parent && "nsfw" in parent ? parent.nsfw === true : false;
	}
	return "nsfw" in channel && channel.nsfw === true;
}
export function isMessageInstance(
	message: APIMessage | MessageContext,
): message is MessageContext {
	return message instanceof MessageContext;
}
export function isAnyInteraction(
	target: APIMessage | MessageContext | InteractionContext,
): target is InteractionContext {
	return target instanceof InteractionContext;
}
export function isAnyInteractableInteraction(
	target: APIMessage | MessageContext | InteractionContext,
): target is AnyInteractableInteraction {
	return isAnyInteraction(target) && target.isRepliable();
}
/** Whether a native member includes its user, as full member fetches do. */
export function isGuildMember(
	member:
		| APIGuildMember
		| APIInteractionGuildMember
		| APIInteractionDataResolvedGuildMember
		| Nullish,
): member is APIGuildMember {
	return (
		!!member && "user" in member && !!member.user && Array.isArray(member.roles)
	);
}
export function isMediaAttachment(attachment: APIAttachment): boolean {
	return (
		!!attachment.content_type &&
		(attachment.content_type.startsWith("audio/") ||
			((attachment.content_type.startsWith("image/") ||
				attachment.content_type.startsWith("video/")) &&
				hasDimensionsDefined(attachment)))
	);
}
export function isImageAttachment(attachment: APIAttachment): boolean {
	return (
		!!attachment.content_type?.startsWith("image/") &&
		hasDimensionsDefined(attachment)
	);
}
function hasDimensionsDefined(attachment: APIAttachment): boolean {
	return !!attachment.width && !!attachment.height;
}
