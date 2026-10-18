import { writeEvent } from "../../../core/logging/diagnostics";
import { Listener } from "../../../events/listener";
import { Task } from "../Task";
import { TaskEvents } from "../types/TaskEvents";

export class ErrorListener extends Listener<
	typeof TaskEvents.ScheduledTaskError
> {
	public constructor(context: Listener.Context) {
		super(context, {
			name: TaskEvents.ScheduledTaskError,
			event: TaskEvents.ScheduledTaskError,
		});
	}

	public override run(error: unknown, task: Task) {
		const { name, location } = task;
		writeEvent(this.container.logger, "error", {
			component: "tasks",
			event: "task_failed",
			message:
				"Scheduled task execution failed; inspect this task's run handler.",
			error,
			context: { task: name, path: location.full },
		});
	}
}
