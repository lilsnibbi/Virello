# Scheduled tasks

[Docs](README.md) / Scheduling · [Options and records](../src/extensions/scheduledTasks/types/TaskTypes.ts)

## Queue work for later

Create **`tasks/audit.ts`**:

```ts
import { Task, type TaskRunContext } from "virello/scheduling";

declare module "virello" {
	interface Tasks {
		audit: { label: string };
	}
}

export default class AuditTask extends Task<"audit"> {
	override run(payload: { label: string }, context?: TaskRunContext): void {
		context?.signal.throwIfAborted();
		this.container.logger.notif("Audit: " + payload.label);
	}
}
```

Set `modules.tasks: "tasks/**/*.ts"` and keep `scheduledtasks` enabled.
Inside a command or listener, queue an attempt five seconds from now:

```ts
const job = await this.container.tasks.create(
	{ name: "audit", payload: { label: "daily check" } },
	{ delay: 5000, attempts: 3, retryDelay: 1000 },
);
```

The `Tasks` augmentation types names and payloads; it does not load the module.
Payloads must be plain, acyclic JSON (or `undefined` for a no-payload task).
No Dates, class instances, bigint or nested undefined values.

## Choose the schedule

These are alternate second arguments to `create()`:

| Schedule           | Options                                                               | First run                       |
| ------------------ | --------------------------------------------------------------------- | ------------------------------- |
| Once, immediately  | `{}`                                                                  | When the queue next claims work |
| Once, later        | `{ delay: 5000 }` or `5000`                                           | After that delay                |
| Repeating interval | `{ repeated: true, interval: 60000 }`                                 | One interval after creation     |
| Cron               | `{ repeated: true, pattern: "0 9 * * *", timezone: "Europe/London" }` | Next matching time              |

Interval and cron are mutually exclusive. Repeats cannot include `delay`;
cron timezone defaults to `UTC`. Missed repeats are skipped instead of replaying
a backlog. To auto-register a no-payload task at login, declare its payload as
`never` and put `interval` or `pattern` on its static `Task.Options`.

## Memory or Redis?

|                               | Default memory backend     | Explicit Redis backend                            |
| ----------------------------- | -------------------------- | ------------------------------------------------- |
| Configure                     | Omit `redis_url`           | Set `extensions.scheduledtasks.redis_url`         |
| Survives restart              | No                         | Stored records survive if Redis retains them      |
| Shared across shard processes | No; each has its own queue | Yes, when URL and queue name match                |
| Startup connection failure    | No network connection      | Fails critical task startup and closes the client |

For Redis, read and validate your environment setting explicitly:

```ts
const redisUrl = Bun.env.REDIS_URL;
if (!redisUrl) throw new Error("Set REDIS_URL for shared scheduling.");
// Use in VirelloClient options:
const extensions = {
	scheduledtasks: { redis_url: redisUrl, queue: "my-bot-jobs" },
};
```

`REDIS_URL` is **not** read automatically. Every worker sharing a queue should
load the same task implementations. A claimed job with a missing or disabled
task fails; the scheduler does not locate a different worker by task capability.

## Defaults and delivery

| Option                                  | Default           | Meaning                                                  |
| --------------------------------------- | ----------------- | -------------------------------------------------------- |
| `queue`                                 | `scheduled-tasks` | Redis namespace                                          |
| `pollInterval`                          | `250`             | Poll period in ms                                        |
| `concurrency`                           | `1`               | Running jobs per scheduler process                       |
| `leaseDuration`                         | `30000`           | Ownership lease in ms, renewed during work; minimum `30` |
| `connectionTimeout` / `commandTimeout`  | `3000` / `5000`   | Redis deadlines in ms                                    |
| Job `attempts` / `retryDelay`           | `1` / `0`         | Total failure attempts / fixed delay in ms               |
| Job `removeOnComplete` / `removeOnFail` | `true` / `false`  | One-off record retention                                 |

- `login()` registers automatic repeats and starts polling in `afterLogin`.
  `client.load()` alone does not start it; use `await container.tasks.start()`
  if you deliberately run a loaded client offline.
- A custom `jobId` keeps the existing record when reused. Default repeat IDs
  derive from name and schedule, **not payload**; use distinct IDs for different
  payloads on the same schedule.
- Lease loss aborts `context.signal`; your code must stop its own work.
  Another worker can retry the job. Make external effects safe to repeat.
- `destroy()` closes the scheduler before unloading task modules. Shutdown
  waits for running work; a handler that never settles can hold it open.

## Inspect or cancel

| Method on `container.tasks`              | Does                                                       |
| ---------------------------------------- | ---------------------------------------------------------- |
| `get(id)`                                | Fresh record snapshot or `undefined`                       |
| `list({ types: ["waiting", "failed"] })` | Filter by stored state                                     |
| `listRepeated()`                         | Repeat definitions and next runs                           |
| `delete(id)`                             | Remove future work; cannot undo a running side effect      |
| `cleanup()`                              | Delete completed/failed records older than now             |
| `run(task)`                              | Run now without storing/retrying a job; returns elapsed ms |

Records are snapshots, not live job objects. Refresh with `get()`.
Task events live in `TaskEvents`; errors and missing tasks have built-in log
listeners. [Scheduler implementation →](../src/extensions/scheduledTasks/TaskScheduler.ts)
