import {
	PermissionFlagsBits as P,
	type APIChannel,
} from "discord-api-types/v10";
import { container } from "../../core/Container";
import type { VirelloClient } from "../../core/client/VirelloClient";
import {
	permissionsFor,
	type PermissionInput,
} from "../../discord/permissions";
import {
	isDMChannel,
	isGuildBasedChannel,
	isThreadChannel,
	isVoiceBasedChannel,
} from "./type-guards";
import type { VoiceBasedChannelTypes } from "./utility-types";

async function allowed(
	channel: APIChannel | null | undefined,
	required: PermissionInput,
	client: VirelloClient,
	sending = false,
): Promise<boolean> {
	if (!channel) return false;
	if (isDMChannel(channel)) return true;
	if (!isGuildBasedChannel(channel) || !client?.user) return false;
	const guildId = channel.guild_id ?? client.cache.guildForChannel(channel.id);
	if (!guildId) return false;
	const permissions = await permissionsFor(
		client,
		guildId,
		channel.id,
		client.user.id,
	);
	if (isThreadChannel(channel)) {
		if (
			channel.type === 12 &&
			!channel.member &&
			!permissions.has(P.ManageThreads)
		)
			return false;
		if (
			sending &&
			channel.thread_metadata?.archived &&
			channel.thread_metadata.locked &&
			!permissions.has(P.ManageThreads)
		)
			return false;
	}
	return permissions.has(required);
}
function sendingPermissions(channel: APIChannel | null | undefined): bigint[] {
	return [
		P.ViewChannel,
		isThreadChannel(channel) ? P.SendMessagesInThreads : P.SendMessages,
	];
}
/** Check native channel permissions. Missing member/role/channel data can trigger REST fetches. */
export function canReadMessages(
	channel: APIChannel | null | undefined,
	client = container.client,
): Promise<boolean> {
	return allowed(channel, [P.ViewChannel], client);
}
export function canSendMessages(
	channel: APIChannel | null | undefined,
	client = container.client,
): Promise<boolean> {
	return allowed(channel, sendingPermissions(channel), client, true);
}
export function canSendEmbeds(
	channel: APIChannel | null | undefined,
	client = container.client,
): Promise<boolean> {
	return allowed(
		channel,
		[...sendingPermissions(channel), P.EmbedLinks],
		client,
		true,
	);
}
export function canSendAttachments(
	channel: APIChannel | null | undefined,
	client = container.client,
): Promise<boolean> {
	return allowed(
		channel,
		[...sendingPermissions(channel), P.AttachFiles],
		client,
		true,
	);
}
export function canReact(
	channel: APIChannel | null | undefined,
	client = container.client,
): Promise<boolean> {
	if (isThreadChannel(channel) && channel.thread_metadata?.archived)
		return Promise.resolve(false);
	return allowed(
		channel,
		[P.ViewChannel, P.ReadMessageHistory, P.AddReactions],
		client,
	);
}
export function canRemoveAllReactions(
	channel: APIChannel | null | undefined,
	client = container.client,
): Promise<boolean> {
	if (isDMChannel(channel)) return Promise.resolve(false);
	return allowed(
		channel,
		[P.ViewChannel, P.ReadMessageHistory, P.ManageMessages],
		client,
	);
}
/** Check native voice permissions and cached occupancy. Accurate occupancy requires GuildVoiceStates and an unfiltered voice-state cache. */
export async function canJoinVoiceChannel(
	channel: VoiceBasedChannelTypes | null | undefined,
	client = container.client,
): Promise<boolean> {
	if (!isVoiceBasedChannel(channel) || !client?.user) return false;
	const guildId = channel.guild_id ?? client.cache.guildForChannel(channel.id);
	if (!guildId) return false;
	const permissions = await permissionsFor(
		client,
		guildId,
		channel.id,
		client.user.id,
	);
	if (!permissions.has([P.ViewChannel, P.Connect])) return false;
	if (
		client.cache.voiceStates.get(guildId, client.user.id)?.data.channel_id ===
		channel.id
	)
		return true;
	const occupancy = [...client.cache.voiceStates.values(guildId)].filter(
		(entry) => entry.data.channel_id === channel.id,
	).length;
	return (
		!channel.user_limit ||
		occupancy < channel.user_limit ||
		permissions.has(P.MoveMembers)
	);
}
