import { ChannelType } from "discord-api-types/v10";
import type { Message } from "discord.js";
import { Events, type MessageCommandRunPayload } from "../../../events/events";
import { Listener } from "../../../events/listener";
import { isStageChannel } from "../../../utilities/discord/index";
import type { MessageCommand } from "../../types";

export class MessageCommandTypingListener extends Listener<
	typeof Events.MessageCommandRun
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.MessageCommandRun });
		this.enabled = this.container.client.options.typing ?? false;
	}

	public async run(
		message: Message,
		command: MessageCommand,
		payload: MessageCommandRunPayload,
	) {
		if (!command.typing || isStageChannel(message.channel)) {
			return;
		}

		if (message.channel?.type === ChannelType.GroupDM) {
			return;
		}

		try {
			await message.channel.sendTyping();
		} catch (error) {
			message.client.emit(Events.MessageCommandTypingError, error as Error, {
				...payload,
				command,
				message,
			});
		}
	}
}
