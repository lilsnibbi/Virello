import {
	ChannelType,
	MessageType,
	type APIMessage,
	type GatewayMessageCreateDispatchData,
} from "discord-api-types/v10";
import { MessageContext, type VirelloClient } from "virello";

/** Native gateway data shared by existing offline framework suites. */
export function message(
	client: VirelloClient,
	data: Partial<GatewayMessageCreateDispatchData>,
): MessageContext {
	return new MessageContext(client, {
		id: "123456789012345679",
		channel_id: "123456789012345678",
		content: "",
		timestamp: new Date().toISOString(),
		edited_timestamp: null,
		author: {
			id: "123456789012345680",
			username: "tester",
			global_name: null,
			discriminator: "0",
			avatar: null,
		},
		tts: false,
		mention_everyone: false,
		mentions: [],
		mention_roles: [],
		attachments: [],
		embeds: [],
		pinned: false,
		type: MessageType.Default,
		...data,
	} satisfies APIMessage);
}

export function dm(client: VirelloClient, id = "123456789012345678") {
	const channel = {
		id,
		type: ChannelType.DM as const,
		name: null,
		recipients: [],
		last_message_id: null,
	};
	client.cache.channels.put(id, channel);
	return channel;
}
