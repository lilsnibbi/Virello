import { PermissionFlagsBits } from "discord-api-types/v10";
import { MessageContext as Message } from "../../../discord/MessageContext";
import { permissionsFor } from "../../../discord/permissions";
import {
	ChannelMessageRegex,
	MessageLinkRegex,
	SnowflakeRegex,
} from "../../../utilities/discord/constants/regexes";
import {
	isAnyInteraction,
	isTextBasedChannel,
} from "../../../utilities/discord/type-guards";
import type {
	AnyInteraction,
	TextBasedChannelTypes,
} from "../../../utilities/discord/utility-types";
import { Result } from "../../../utilities/result/index";
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
			for (const scope of client.cache.messages.scopeIds()) {
				if (client.cache.guildForChannel(scope) !== invocation.guildId)
					continue;
				const cached = client.cache.messages.get(scope, parameter);
				if (cached?.complete && (await visible(scope, options)))
					return Result.ok(new Message(client, cached.data));
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
	const data = await client.engine.fetchMessage(channelId, messageId);
	return Result.ok(new Message(client, data));
}

async function visible(
	channelId: string,
	options: MessageResolverOptions,
): Promise<boolean> {
	const invocation = options.messageOrInteraction;
	const client = invocation.client;
	if (channelId === invocation.channelId) return true;
	const entry = client.cache.channels.get(channelId);
	if (!entry?.complete || !isTextBasedChannel(entry.data)) return false;
	const guildId = client.cache.guildForChannel(channelId);
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
