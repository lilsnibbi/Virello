import { Module } from "../../core/modules/index";
import type { Awaitable } from "../../utilities/index";
import { validateJobOptions, validateRepeat } from "./timing";
import type {
	TaskJobOptions,
	TaskName,
	TaskPayload,
	TaskRunContext,
} from "./types/TaskTypes";

/** A scheduled task that can be run at a specified interval or pattern. @abstract */
export abstract class Task<
	Task extends TaskName = TaskName, //
	Options extends Task.Options = Task.Options,
> extends Module<Options, "tasks"> {
	/** Optional task metadata passed as constructor options by the loader. */
	public static override readonly options?: Task.Options;
	/** Automatic repeat interval in milliseconds, or null when unused. */
	public readonly interval: number | null;
	/** Automatic repeat cron expression, or null when unused. */
	public readonly pattern: string | null;
	/** Timezone for this module’s cron schedule. Defaults to UTC. */
	public readonly timezone: string;
	/** Retry, identity, and retention defaults for this module’s automatic repeated job. */
	public readonly jobOptions?: TaskJobOptions;

	/**
	 * Create a task module and validate automatic scheduling settings.
	 * @param context - Loader metadata and task store.
	 * @param options - Module and schedule settings; defaults to an empty object.
	 * @throws For invalid or conflicting interval/cron settings, invalid timezones, or unsupported job options.
	 */
	public constructor(context: Task.Context, options: TaskOptionsBase = {}) {
		super(context, options);
		this.interval = options.interval ?? null;
		this.pattern = options.pattern ?? null;
		this.jobOptions = options.jobOptions;
		this.timezone = options.timezone ?? "UTC";
		if (this.interval !== null || this.pattern !== null)
			validateRepeat({
				...(this.interval !== null ? { interval: this.interval } : {}),
				...(this.pattern !== null
					? { pattern: this.pattern, timezone: this.timezone }
					: {}),
			});
		if (this.jobOptions) {
			for (const key of Object.keys(this.jobOptions))
				if (
					![
						"jobId",
						"attempts",
						"retryDelay",
						"removeOnComplete",
						"removeOnFail",
					].includes(key)
				)
					throw new TypeError(`Unsupported task job option "${key}".`);
			validateJobOptions(this.jobOptions);
		}
	}

	/**
	 * Execute one task attempt. Jobs can run again after lease loss, so make external effects safe to repeat.
	 * @param payload - Payload declared for this task.
	 * @param context - Job and lease-cancellation metadata for queued work; direct run calls may omit it.
	 * @returns Any value, awaited and included in the success event. Throw to fail the attempt.
	 */
	public abstract run(
		payload: TaskPayload<Task>,
		context?: TaskRunContext,
	): Awaitable<unknown>;
}

/** Options for configuring a scheduled task. */
export interface TaskOptionsBase extends Module.Options {
	/** The interval (in milliseconds) at which the task should run. */
	interval?: number | null;
	/** A cron pattern specifying when the task should run. */
	pattern?: string | null;
	/** Custom options to pass to the job scheduler. */
	jobOptions?: TaskJobOptions;

	/** The timezone to use for the task.
	 * @default 'UTC' */
	timezone?: string | null;
}

/** Custom options for a job in a scheduled task. */
export type ScheduledTaskCustomJobOptions = TaskJobOptions;

/** The namespace for {@link Task}. */
export declare namespace Task {
	/** The options for a {@link Task}. */
	export type Options = TaskOptionsBase;
	/** Shorthand for {@link Module.Context}. */
	export type Context = Module.Context<"tasks">;
	/** Shorthand for {@link Module.JSON}. */
	export type JSON = Module.JSON;
	/** Shorthand for {@link Module.LocationJSON}. */
	export type LocationJSON = Module.LocationJSON;
}
