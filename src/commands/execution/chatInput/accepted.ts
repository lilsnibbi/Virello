import {
	type ChatInputCommandAcceptedPayload,
	Events,
} from "../../../events/events";
import { Listener } from "../../../events/listener";
import { Result } from "../../../utilities/result/index";
import { Stopwatch } from "../../../utilities/time/stopwatch/index";

export class AcceptedListener extends Listener<
	typeof Events.ChatInputCommandAccepted
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.ChatInputCommandAccepted });
	}

	public async run(payload: ChatInputCommandAcceptedPayload) {
		const { command, context, interaction } = payload;

		const result = await Result.fromAsync(async () => {
			this.container.client.emit(
				Events.ChatInputCommandRun,
				interaction,
				command,
				{ ...payload },
			);

			const stopwatch = new Stopwatch();
			const result = await command.chatInputRun(interaction, context);
			const { duration } = stopwatch.stop();

			this.container.client.emit(Events.ChatInputCommandSuccess, {
				...payload,
				result,
				duration,
			});

			return duration;
		});

		result.inspectErr((error) =>
			this.container.client.emit(Events.ChatInputCommandError, error, {
				...payload,
				duration: -1,
			}),
		);

		this.container.client.emit(
			Events.ChatInputCommandFinish,
			interaction,
			command,
			{
				...payload,
				success: result.isOk(),
				duration: result.unwrapOr(-1),
			},
		);
	}
}
