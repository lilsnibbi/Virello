# When something does not work

[Docs](README.md) / Troubleshooting

Start with the failed step, not another restart:

| Symptom                            | Check                                                              | Next step                                                                    |
| ---------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Command file never runs            | `modules.commands`, `root`, filename/export                        | `await client.load()`; inspect the command store                             |
| Store is empty                     | Globs scan nothing; helpers/declarations may be skipped            | Enable `traceModules: true` and debug logs                                   |
| Command appears twice              | Old guild/global registration still exists                         | Remove the unwanted registration in its original scope                       |
| Command appears but does not route | Module name, registered name, command ID aliases                   | Check every shard loaded the same routes                                     |
| “Application did not respond”      | No initial reply/defer, blocked REST queue, thrown handler         | Add [failure listeners](events.md#reply-to-failures); defer before slow work |
| Message command never runs         | `messageCommands`, prefix, intents, Message Content portal setting | Also check bot View/Send permissions; threads need Send Messages in Threads  |
| Message fields are absent          | Partial update or cache miss                                       | Check `complete`; explicitly fetch when needed                               |
| `client.rest` throws before login  | Engine is created during gateway startup                           | Use a standalone `RestClient` for REST-only tooling                          |
| HTTP 403                           | App/user permissions or unavailable resource                       | Inspect native error body and applicable permissions                         |
| HTTP 429 / capacity error          | REST bucket/global wait or local queue bound                       | Reduce bursts; inspect [limits](caching-and-limits.md#rest-requests)         |
| `replyState === "unknown"`         | Initial response failed ambiguously                                | Do not blindly send a second initial response                                |
| Login fails after a close code     | Token, intents, shard tuple, recovery budget                       | Read the gateway diagnostic; fatal failures close the client                 |
| `maintenance === true`             | Coordinator ownership not reconciled                               | [Recovery checklist](sharding-recovery.md)                                   |
| A shard stays dormant              | No assignment/capacity available                                   | Inspect leases and host capacity before starting replacements                |
| Task never runs                    | Task module loaded? Scheduler started? Same Redis queue?           | [Task lifecycle](scheduling.md#defaults-and-delivery)                        |
| Translation is a key/fallback      | Locale file path, namespace, loaded languages                      | [Locale setup](localisation.md); restart after edits                         |
| “Only one VirelloClient”           | Previous client still active or cleaning up                        | Await its `destroy()` before creating another                                |

## Inspect a loaded bot without Discord

```ts
const client = new VirelloClient({
	intents: [],
	root: import.meta.dir,
	modules: { commands: "commands/**/*.ts" },
	traceModules: true,
	loggerOptions: { level: "DEBUG" },
});
try {
	await client.load();
	console.log([...client.modules.require("commands").keys()]);
} finally {
	await client.destroy();
}
```

Add `import { VirelloClient } from "virello/client";` to run that as a file.
This checks discovery and module activation; it does not verify live permissions,
command registration or gateway connectivity.

## Read a REST failure

```ts
import { RestError } from "virello/engine";

try {
	await client.send(channelId, "Hello");
} catch (error) {
	if (error instanceof RestError) {
		console.error("Discord HTTP status:", error.status);
		// error.body is unknown: narrow it before reading Discord's code/message.
	}
	throw error;
}
```

Do not treat all failures as HTTP errors: cancellation, capacity, malformed
responses and transport failures can be ordinary Errors.

For useful reports, include the Virello/Bun versions, failing operation, relevant
option keys, error code, and a small reproduction. Native interaction payloads
contain response tokens; omit them from reports and logs.
