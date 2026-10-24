import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import type { MessageContext } from "../../discord/MessageContext";
import { isThreadChannel } from "../../utilities/discord/type-guards";

/** Check the invocation channel before starting prefix or pattern processing. */
export async function canRunMessageCommand(
	message: MessageContext,
): Promise<boolean> {
	const channel =
		message.channel ??
		(await message.client.engine.fetchChannel(message.channelId));
	if (channel.type === ChannelType.GroupDM) return false;
	if (channel.type === ChannelType.DM) return true;
	if (!message.guildId || !message.client.id) return false;
	const permissions = await message.permissionsFor(message.client.id);
	return permissions.has([
		PermissionFlagsBits.ViewChannel,
		isThreadChannel(channel)
			? PermissionFlagsBits.SendMessagesInThreads
			: PermissionFlagsBits.SendMessages,
	]);
}
