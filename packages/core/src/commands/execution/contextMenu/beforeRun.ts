import {
	Events,
	type PreContextMenuCommandRunPayload,
} from "../../../events/events";
import { Listener } from "../../../events/listener";

export class BeforeRunListener extends Listener<
	typeof Events.PreContextMenuCommandRun
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.PreContextMenuCommandRun });
	}

	public async run(payload: PreContextMenuCommandRunPayload) {
		const { command, interaction } = payload;

		// Run global preconditions:
		const globalResult = await this.container.modules
			.require("preconditions")
			.contextMenuRun(interaction, command, payload);
		if (globalResult.isErr()) {
			this.container.client.emit(
				Events.ContextMenuCommandDenied,
				globalResult.unwrapErr(),
				payload,
			);
			return;
		}

		// Run command-specific preconditions:
		const localResult = await command.preconditions.contextMenuRun(
			interaction,
			command,
			payload,
		);
		if (localResult.isErr()) {
			this.container.client.emit(
				Events.ContextMenuCommandDenied,
				localResult.unwrapErr(),
				payload,
			);
			return;
		}

		this.container.client.emit(Events.ContextMenuCommandAccepted, payload);
	}
}
