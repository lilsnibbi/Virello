import {
	Events,
	type PreMessageCommandRunPayload,
} from "../../../events/events";
import { Listener } from "../../../events/listener";

export class PreMessageCommandRunListener extends Listener<
	typeof Events.PreMessageCommandRun
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.PreMessageCommandRun });
	}

	public async run(payload: PreMessageCommandRunPayload) {
		const { message, command } = payload;

		// Run global preconditions:
		const globalResult = await this.container.modules
			.require("preconditions")
			.messageRun(message, command, payload);
		if (globalResult.isErr()) {
			message.client.emit(
				Events.MessageCommandDenied,
				globalResult.unwrapErr(),
				payload,
			);
			return;
		}

		// Run command-specific preconditions:
		const localResult = await command.preconditions.messageRun(
			message,
			command,
			payload,
		);
		if (localResult.isErr()) {
			message.client.emit(
				Events.MessageCommandDenied,
				localResult.unwrapErr(),
				payload,
			);
			return;
		}

		message.client.emit(Events.MessageCommandAccepted, payload);
	}
}
