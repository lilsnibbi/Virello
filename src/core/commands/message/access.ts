import { permissionsFor } from "../../discord/permissions";
import { ChannelType, PermissionFlagsBits } from "discord-api-types/v10";
import type { Message as MessageContext } from "discord.js";
import { isThreadChannel } from "../../utilities/discord/type-guards";

/** Check the invocation channel before starting prefix or pattern processing. */
export async function canRunMessageCommand(
	message: MessageContext,
): Promise<boolean> {
	const channel =
		message.channel ?? (await message.client.channels.fetch(message.channelId));
	if (channel.type === ChannelType.GroupDM) return false;
	if (channel.type === ChannelType.DM) return true;
	if (!message.guildId || !message.client.user?.id) return false;
	const permissions = await permissionsFor(
		message.client,
		message.guildId,
		message.channelId,
		message.client.user?.id,
	);
	return permissions.has([
		PermissionFlagsBits.ViewChannel,
		isThreadChannel(channel)
			? PermissionFlagsBits.SendMessagesInThreads
			: PermissionFlagsBits.SendMessages,
	]);
}
