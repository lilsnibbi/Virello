import type { Task } from "../Task";

/** Events emitted during the process setting up the scheduler and running a task. You can use these events to trace the progress for debugging purposes. */
export const TaskEvents = {
	/** A queued job has no enabled task module; receives its name and payload. */
	ScheduledTaskNotFound: "scheduledTaskNotFound" as const,
	/** A task attempt is about to run; receives the module and payload. */
	ScheduledTaskRun: "scheduledTaskRun" as const,
	/** A task attempt failed; receives the error, module, and payload. */
	ScheduledTaskError: "scheduledTaskError" as const,
	/** A task attempt succeeded; receives module, payload, result, and elapsed milliseconds. */
	ScheduledTaskSuccess: "scheduledTaskSuccess" as const,
	/** A task attempt ended; receives module, duration in milliseconds (null on failure), and payload. */
	ScheduledTaskFinished: "scheduledTaskFinished" as const,
	/** The scheduler backend operation failed; receives the storage Error. */
	StorageError: "taskStorageError" as const,
};

/** Add scheduler event argument tuples to discord.js. */
declare module "../../../events/events" {
	/** Arguments passed with TaskEvents. */
	interface ClientEvents {
		/** A queued job has no enabled task module; receives its name and payload. */
		[TaskEvents.ScheduledTaskNotFound]: [
			task: string, //
			payload: unknown,
		];
		/** A task attempt is about to run; receives the module and payload. */
		[TaskEvents.ScheduledTaskRun]: [
			task: Task, //
			payload: unknown,
		];
		/** A task attempt failed; receives the error, module, and payload. */
		[TaskEvents.ScheduledTaskError]: [
			error: unknown, //
			task: Task,
			payload: unknown,
		];
		/** A task attempt succeeded; receives module, payload, result, and elapsed milliseconds. */
		[TaskEvents.ScheduledTaskSuccess]: [
			task: Task, //
			payload: unknown,
			result: unknown,
			duration: number,
		];
		/** A task attempt ended; receives module, duration in milliseconds (null on failure), and payload. */
		[TaskEvents.ScheduledTaskFinished]: [
			task: Task, //
			duration: number | null,
			payload: unknown,
		];
		/** The scheduler backend operation failed; receives the storage Error. */
		[TaskEvents.StorageError]: [error: Error];
	}
}
