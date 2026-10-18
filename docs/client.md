# Client configuration

[Docs](README.md) / Client · [Option types](../src/core/client/VirelloClient.ts)

```ts
import { VirelloClient } from "virello/client";

const client = new VirelloClient({
	intents: ["Guilds"],
	root: import.meta.dir,
	modules: {
		commands: "commands/**/*.ts",
		listeners: "listeners/**/*.ts",
		interactions: "interactions/**/*.ts",
	},
	logging: { format: "json" },
});

await client.load(); // Discover modules without connecting to Discord.
await client.destroy();
```

Use `await client.login(token)` in a running bot. It calls `load()` for you.
Construction alone opens no Discord connection.

## Options you'll use

`VirelloClient` owns one native engine. `intents` accepts a numeric mask or an
array of intent names/numbers. Configure the runtime through these options:

| Option               | Default                                         | Use                                                                                      |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `cache`              | 1,000 members/guild; messages off               | [Retention and completeness](caching-and-limits.md)                                      |
| `rest`               | 8 concurrent / 1,024 pending requests           | [REST limits and retries](caching-and-limits.md#rest-requests)                           |
| `gateway`            | One shard; 15s handshakes; 10 recovery attempts | Native transport overrides and optional `shard: [id, count]`                             |
| `presence`           | Unset                                           | Native Discord presence sent in a fresh IDENTIFY                                         |
| `waitForIdentify`    | Local engine gate only                          | External permit callback; managed sharding supplies it                                   |
| `onError`            | Framework logger                                | Synchronous engine diagnostic callback with `source`, `error`, `fatal`                   |
| `maxPendingHandlers` | `1024`                                          | Low-level engine subscribers; framework EventEmitter listeners have separate concurrency |

Framework options:

| Option                                               | Default                          | Effect                                                                                               |
| ---------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `root`                                               | `process.cwd()`                  | Base directory for module and locale paths; accepts a string or file URL                             |
| `modules`                                            | No file patterns                 | Explicit globs by [module kind](modules.md#choose-what-loads)                                        |
| `extensions`                                         | All five built-ins enabled       | Options objects, `false` to disable, `custom` for your classes                                       |
| `messageCommands`                                    | `false`                          | Enables prefix parsing and the message pipeline used by patterns                                     |
| `defaultPrefix`                                      | `null`                           | String or array; null means no regular prefix                                                        |
| `disableMentionPrefix`                               | `false`                          | Turns off bot mentions as prefixes                                                                   |
| `fetchPrefix`                                        | Returns `defaultPrefix ?? null`  | Per-message async or sync prefix selection                                                           |
| `regexPrefix`                                        | Unset                            | Alternative message prefix; checked after mentions, before regular prefixes                          |
| `caseInsensitiveCommands`, `caseInsensitivePrefixes` | `false`                          | Case handling for message command lookup/prefixes                                                    |
| `typing`                                             | `false`                          | Sends typing for accepted message commands that also permit it                                       |
| `defaultCooldown`                                    | User scope, limit `1`, delay `0` | Delay zero disables [command cooldowns](checks.md#cooldowns)                                         |
| `id`                                                 | `null`                           | Optional bot ID for mention parsing; populated from the ready client                                 |
| `logErrors`, `logRegistrations`                      | `true`                           | Installs built-in error/status log listeners                                                         |
| `traceModules`                                       | `false`                          | Emits module discovery detail at debug level                                                         |
| `logger`                                             | Framework-owned console logger   | Reuses your exact instance; [logging options](console-logging.md) apply to framework-created loggers |
| `preventFailedToFetchLogForGuilds`                   | Unset                            | Suppresses fetch-failure logs for selected guilds, or all with `true`; still fetches                 |

Built-in extension keys:

| Key               | Adds                                   | Configure it                                           |
| ----------------- | -------------------------------------- | ------------------------------------------------------ |
| `localisation`    | `container.i18n`                       | [Translations](localisation.md)                        |
| `scheduledtasks`  | `container.tasks`, `tasks` store       | [Memory/Redis scheduling](scheduling.md)               |
| `patternCommands` | `patterns` store                       | [Regex commands](message-commands.md#pattern-commands) |
| `subcommands`     | Subcommand checks/error listeners      | [Subcommands](commands.md#subcommands)                 |
| `services`        | `container.services`, `services` store | [Shared resources](extensions.md)                      |

To disable unused features, put `false` under their keys in `extensions`.
Omitting a key keeps it enabled. A disabled extension's container property may be
absent at runtime even though the shared TypeScript interface declares it.

## Process rules

- **One active `VirelloClient` per process.** Await `destroy()` before making
  another. Shard processes each have their own client and container.
- `load()`, `login()` and `destroy()` reuse their respective promises.
  A destroyed client cannot be reopened.
- `container.client`, `container.modules`, `container.logger` and
  `container.sharding` refer to the active client. Modules can use
  `this.container`.
- Invalid framework settings throw during construction. Removed options such
  as `plugins`, `hmr` and top-level `tasks` are rejected.
- In a managed child, `ShardManager` owns `gateway.shard` and
  `waitForIdentify`. Supplying either conflicts with supervision and throws.
- `partials`, `makeCache`, `sweepers`, `ws`, `shards` and `shardCount` are
  rejected. Use the native settings above.
- `client.cache` exists before login. `client.engine` and `client.rest` become
  available when gateway startup begins. `client.user` starts as `null`.
  `client.ping` is `null` until a heartbeat is acknowledged.

[Lifecycle and cleanup →](modules.md#startup-and-shutdown) ·
[Maintenance behavior →](sharding-recovery.md)
