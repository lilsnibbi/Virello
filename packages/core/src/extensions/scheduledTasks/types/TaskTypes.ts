/** Queue storage, polling, and job-lease settings. Omit redis_url for a process-local queue. */
export interface TaskSchedulerOptions {
	/** Explicit Redis URL for persistent shared scheduling. No environment URL is read automatically. */
	redis_url?: string;
	/** Redis queue namespace. Defaults to scheduled-tasks. */
	queue?: string;
	/** Positive polling interval in milliseconds. Defaults to 250. */
	pollInterval?: number;
	/** Positive maximum number of locally running jobs. Defaults to 1. */
	concurrency?: number;
	/** Job ownership lease in milliseconds, at least 30. Defaults to 30000 and is renewed while running. */
	leaseDuration?: number;
	/** Redis connection deadline in milliseconds. Defaults to 3000. */
	connectionTimeout?: number;
	/** Redis command deadline in milliseconds. Defaults to 5000. */
	commandTimeout?: number;
	/** Install built-in task error listeners when used by TasksExtension. Defaults to true. */
	logErrors?: boolean;
}

/** Stored job lifecycle state. */
export type TaskState = "waiting" | "active" | "completed" | "failed";
/** Job identity, retry, and retention settings. */
export interface TaskJobOptions {
	/**
	 * Optional nonempty job ID. Existing IDs keep their existing record. One-off jobs otherwise use a UUID; repeats use a
	 * stable schedule hash.
	 */
	jobId?: string;
	/** Positive total attempts before a run is marked failed. Defaults to 1. */
	attempts?: number;
	/** Nonnegative fixed delay in milliseconds before a failed attempt retries. Defaults to 0. */
	retryDelay?: number;
	/** Remove successful one-off jobs. Defaults to true. Repeating jobs schedule their next occurrence. */
	removeOnComplete?: boolean;
	/** Remove failed one-off jobs after attempts are exhausted. Defaults to false. Repeated jobs schedule their next occurrence instead. */
	removeOnFail?: boolean;
}
/** Choose a one-off delay, repeated interval, or repeated cron pattern. Interval and cron settings cannot be combined. */
export type TaskOptions = TaskJobOptions &
	(
		| {
				/** Set true for interval or cron scheduling. Defaults to false for one-off jobs. */
				repeated?: false;
				/** One-off delay in milliseconds, starting at creation. Defaults to 0; unavailable for repeats. */
				delay?: number;
				/** Positive repeat interval in milliseconds. Use only with repeated: true and without cron settings. */
				interval?: never;
				/** Cron expression for repeated: true. Use without interval or delay. */
				pattern?: never;
				/** IANA timezone for cron expressions. Defaults to UTC; unavailable for interval and one-off jobs. */
				timezone?: never;
		  }
		| {
				/** Set true for interval or cron scheduling. Defaults to false for one-off jobs. */
				repeated: true;
				/** One-off delay in milliseconds, starting at creation. Defaults to 0; unavailable for repeats. */
				delay?: never;
				/** Positive repeat interval in milliseconds. Use only with repeated: true and without cron settings. */
				interval: number;
				/** Cron expression for repeated: true. Use without interval or delay. */
				pattern?: never;
				/** IANA timezone for cron expressions. Defaults to UTC; unavailable for interval and one-off jobs. */
				timezone?: never;
		  }
		| {
				/** Set true for interval or cron scheduling. Defaults to false for one-off jobs. */
				repeated: true;
				/** One-off delay in milliseconds, starting at creation. Defaults to 0; unavailable for repeats. */
				delay?: never;
				/** Positive repeat interval in milliseconds. Use only with repeated: true and without cron settings. */
				interval?: never;
				/** Cron expression for repeated: true. Use without interval or delay. */
				pattern: string;
				/** IANA timezone for cron expressions. Defaults to UTC; unavailable for interval and one-off jobs. */
				timezone?: string;
		  }
	);
/** Stored repeat rule. Choose interval, or pattern with an optional timezone. */
export interface TaskRepeat {
	/** Repeat interval in milliseconds. Missed occurrences are skipped when calculating the next run. */
	interval?: number;
	/** Cron expression, used when interval is absent. */
	pattern?: string;
	/** Cron timezone. Defaults to UTC. */
	timezone?: string;
}

/** A saved snapshot. Use the scheduler to refresh or delete it. */
export interface TaskRecord<Payload = unknown> {
	/** Stable job identifier. */
	id: string;
	/** Task module name looked up when the job runs. */
	name: string;
	/** Copied JSON payload, or undefined for a task without payload. */
	data: Payload;
	/** Current stored lifecycle state. */
	state: TaskState;
	/** Creation time in Unix milliseconds. */
	createdAt: number;
	/** Time in Unix milliseconds when this job can next be claimed, including retry delays. */
	runAt: number;
	/** Nominal scheduled time in Unix milliseconds, used to calculate repeat cadence. */
	scheduledAt: number;
	/** Last stored update time in Unix milliseconds. */
	updatedAt: number;
	/** Claims made for the current occurrence, including recovered leases. Resets to 0 when a repeat advances. */
	attemptsMade: number;
	/** Failures counted toward the current run’s attempt limit. */
	failures: number;
	/** Stored retry and retention settings. */
	options: TaskJobOptions;
	/** Repeat rule, absent for one-off jobs. */
	repeat?: TaskRepeat;
	/** Last recorded failure message, when present. */
	lastError?: string;
	/** Current backend lease token, when claimed. Treat it as backend bookkeeping. */
	token?: string;
	/** Current lease expiry in Unix milliseconds, when claimed. */
	leaseUntil?: number;
}
/** Job metadata and cooperative cancellation passed to a scheduled task. */
export interface TaskRunContext {
	/** Aborts when the scheduler loses the job lease. Stop your own work when cancelled; side effects cannot be undone. */
	signal: AbortSignal;
	/** Snapshot of the job claimed for this attempt. */
	job: TaskRecord;
}
/** Slice and ordering settings for stored job lists. */
export interface RepeatedTaskListOptions {
	/** Zero-based starting offset. Defaults to 0. */
	start?: number;
	/** Inclusive ending offset. Omit or use -1 for the remaining jobs. */
	end?: number;
	/** Sort by runAt, then job ID, in ascending order unless false. Defaults to true. */
	asc?: boolean;
}
/** State filters and pagination for stored jobs. */
export interface TaskListOptions extends RepeatedTaskListOptions {
	/** States to include. Omit to include every state; an empty list matches none. */
	types?: TaskState[];
}
/** Completed/failed record cleanup filters. */
export interface TaskCleanupOptions {
	/** Terminal states to remove. Defaults to completed and failed. */
	states?: ("completed" | "failed")[];
	/** Remove records updated before this Unix-millisecond timestamp. Defaults to Date.now(). */
	before?: number;
}
/** Repeated job records returned by listRepeated. */
export type RepeatedTaskInfo = TaskRecord[];
/** Named task without required payload and the options used to register it. */
export interface RepeatedTask {
	/** Task name that accepts no required payload. */
	name: TaskNameWithoutPayload;
	/** Scheduling and job settings passed to create. */
	options: TaskOptions;
}

/** Augment virello with your task names and payloads. */
export interface Tasks {}
/** Task names declared in the augmentable Tasks interface. */
export type TaskName = keyof Tasks;
/** Declared task names whose payload is never or permits undefined. */
export type TaskNameWithoutPayload = {
	[K in TaskName]: Tasks[K] extends never
		? K
		: undefined extends Tasks[K]
			? K
			: never;
}[TaskName];
/** Payload declared for a task name, or undefined for tasks with no payload. */
export type TaskPayload<K extends TaskName = TaskName> = TaskName extends never
	? undefined
	: Tasks[K] extends never
		? undefined
		: Tasks[K];
/** Task reference with no payload. */
export interface TaskWithoutPayload<
	K extends TaskNameWithoutPayload = TaskNameWithoutPayload,
> {
	/** Task name that accepts no required payload. */
	name: K;
}
/** Task reference with its declared payload. */
export interface TaskWithPayload<K extends TaskName = TaskName> {
	/** Registered task name. */
	name: K;
	/** Payload matching the named task’s contract. Stored jobs require acyclic plain JSON. */
	payload: TaskPayload<K>;
}
/** Task name or name/payload object accepted by the scheduler. */
export type TaskResolvable =
	TaskNameWithoutPayload | TaskWithoutPayload | TaskWithPayload;
/** Stored job record with payload inferred from the task reference. */
export type TaskJob<T> =
	T extends TaskWithPayload<infer R>
		? TaskRecord<TaskPayload<R>>
		: TaskRecord<undefined>;
