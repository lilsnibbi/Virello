import {
	Events,
	type PreChatInputCommandRunPayload,
} from "../../../events/events";
import { Listener } from "../../../events/listener";

export class BeforeRunListener extends Listener<
	typeof Events.PreChatInputCommandRun
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.PreChatInputCommandRun });
	}

	public async run(payload: PreChatInputCommandRunPayload) {
		const { command, interaction } = payload;

		// Run global preconditions:
		const globalResult = await this.container.modules
			.require("preconditions")
			.chatInputRun(interaction, command, payload);
		if (globalResult.isErr()) {
			this.container.client.emit(
				Events.ChatInputCommandDenied,
				globalResult.unwrapErr(),
				payload,
			);
			return;
		}

		// Run command-specific preconditions:
		const localResult = await command.preconditions.chatInputRun(
			interaction,
			command,
			payload,
		);
		if (localResult.isErr()) {
			this.container.client.emit(
				Events.ChatInputCommandDenied,
				localResult.unwrapErr(),
				payload,
			);
			return;
		}

		this.container.client.emit(Events.ChatInputCommandAccepted, payload);
	}
}
