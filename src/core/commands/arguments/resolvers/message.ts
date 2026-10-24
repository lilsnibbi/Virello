import { PermissionFlagsBits } from "discord-api-types/v10";
import { Message } from "discord.js";
import { permissionsFor } from "../../../discord/permissions";
import {
	ChannelMessageRegex,
	MessageLinkRegex,
	SnowflakeRegex,
} from "../../../utilities/discord/constants/regexes";
import { isAnyInteraction } from "../../../utilities/discord/type-guards";
import type {
	AnyInteraction,
	TextBasedChannelTypes,
} from "../../../utilities/discord/utility-types";
import { Result } from "../../../../util/result/index";
import { Identifiers } from "../../errors/Identifiers";

/** Invocation and lookup settings for resolveMessage. */
export interface MessageResolverOptions {
	/** Explicit channel. Overrides scan. */
	channel?: TextBasedChannelTypes;
	messageOrInteraction: Message | AnyInteraction;
	/** Search cached messages in this guild before fetching from the invocation channel. */
	scan?: boolean;
}

/** Resolve an ID, same-guild link, or channel/message pair. Cross-channel lookups require user and bot visibility. */
export async function resolveMessage(
	parameter: string,
	options: MessageResolverOptions,
): Promise<Result<Message, Identifiers.ArgumentMessageError>> {
	const invocation = options.messageOrInteraction;
	const client = invocation.client;
	let channelId: string | null = null;
	let messageId: string | null = null;
	if (SnowflakeRegex.test(parameter)) {
		messageId = parameter;
		channelId = options.channel?.id ?? invocation.channelId;
		if (options.scan && !options.channel && invocation.guildId) {
			for (const channel of client.channels.cache.values()) {
				if (
					!("guildId" in channel) ||
					channel.guildId !== invocation.guildId ||
					!channel.isTextBased()
				)
					continue;
				const cached = channel.messages.cache.get(parameter);
				if (cached && (await visible(channel.id, options)))
					return Result.ok(cached);
			}
		}
	} else {
		const link = MessageLinkRegex.exec(parameter);
		if (link && invocation.guildId && link[1] === invocation.guildId) {
			channelId = link[2];
			messageId = link[3];
		} else if (!link) {
			const pair = ChannelMessageRegex.exec(parameter)?.groups;
			if (pair) {
				channelId = pair.channelId;
				messageId = pair.messageId;
			}
		}
	}
	if (!channelId || !messageId || !(await visible(channelId, options)))
		return Result.err(Identifiers.ArgumentMessageError);
	const channel = await client.channels.fetch(channelId);
	if (!channel?.isTextBased())
		return Result.err(Identifiers.ArgumentMessageError);
	return Result.ok(await channel.messages.fetch(messageId));
}

async function visible(
	channelId: string,
	options: MessageResolverOptions,
): Promise<boolean> {
	const invocation = options.messageOrInteraction;
	const client = invocation.client;
	if (channelId === invocation.channelId) return true;
	const channel = client.channels.cache.get(channelId);
	if (!channel?.isTextBased() || !("guildId" in channel)) return false;
	const guildId = channel.guildId;
	if (!guildId || guildId !== invocation.guildId || !client.user) return false;
	const userId = isAnyInteraction(invocation)
		? invocation.user.id
		: invocation.author.id;
	const [user, bot] = await Promise.all([
		permissionsFor(client, guildId, channelId, userId),
		permissionsFor(client, guildId, channelId, client.user.id),
	]);
	return (
		user.has(PermissionFlagsBits.ViewChannel) &&
		bot.has(PermissionFlagsBits.ViewChannel)
	);
}
