import { Listener } from "../../../events/listener";
import { Result } from "@virello/util/result";
import { Stopwatch } from "@virello/util/time";
import { PatternCommandEvents } from "../events";
import type { PatternCommandAcceptedPayload } from "../types";

export class CommandAcceptedListener extends Listener<
	typeof PatternCommandEvents.CommandAccepted
> {
	public constructor(context: Listener.Context) {
		super(context, { event: PatternCommandEvents.CommandAccepted });
	}

	public override async run(payload: PatternCommandAcceptedPayload) {
		const { message, command } = payload;

		const result = await Result.fromAsync(async () => {
			message.client.emit(
				PatternCommandEvents.CommandRun,
				message,
				command,
				payload,
			);

			const stopwatch = new Stopwatch();
			const result = await command.messageRun(message);
			const { duration } = stopwatch.stop();

			message.client.emit(PatternCommandEvents.CommandSuccess, {
				...payload,
				result,
				duration,
			});

			return duration;
		});

		result.inspectErr((error) =>
			message.client.emit(PatternCommandEvents.CommandError, error, {
				...payload,
				duration: -1,
			}),
		);

		message.client.emit(
			PatternCommandEvents.CommandFinished,
			message,
			command,
			{
				...payload,
				success: result.isOk(),
				duration: result.unwrapOr(-1),
			},
		);
	}
}
