import {
	Events,
	type MessageCommandAcceptedPayload,
} from "../../../events/events";
import { Listener } from "../../../events/listener";
import { Result } from "../../../utilities/result/index";
import { Stopwatch } from "../../../utilities/time/stopwatch/index";

export class MessageCommandAcceptedListener extends Listener<
	typeof Events.MessageCommandAccepted
> {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.MessageCommandAccepted });
	}

	public async run(payload: MessageCommandAcceptedPayload) {
		const { message, command, parameters, context } = payload;
		const args = await command.messagePreParse(message, parameters, context);

		const result = await Result.fromAsync(async () => {
			message.client.emit(Events.MessageCommandRun, message, command, {
				...payload,
				args,
			});

			const stopwatch = new Stopwatch();
			const result = await command.messageRun(message, args, context);
			const { duration } = stopwatch.stop();

			message.client.emit(Events.MessageCommandSuccess, {
				...payload,
				args,
				result,
				duration,
			});

			return duration;
		});

		result.inspectErr((error) =>
			message.client.emit(Events.MessageCommandError, error, {
				...payload,
				args,
				duration: -1,
			}),
		);

		message.client.emit(Events.MessageCommandFinish, message, command, {
			...payload,
			args,
			success: result.isOk(),
			duration: result.unwrapOr(-1),
		});
	}
}
