# Read the logs

[Docs](README.md) / Logging · [Logging exports](../src/core/logging/index.ts)

```ts
import { VirelloClient, logEvent } from "virello/client";

const client = new VirelloClient({
	intents: [],
	logging: { format: "json" },
});
logEvent(client.logger, "notif", {
	component: "bot",
	event: "configuration_loaded",
	message: "Bot configuration is ready.",
	context: { commandsEnabled: true },
});
await client.destroy();
```

Levels are `debug`, `notif` (info), `alert` (warning) and `error`.
The default logger is an `@lilsnibbi/logger` instance; Virello prepares event
content and uses its native rendering.

## Pick the view you need

| Goal                                | Setting                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| Normal terminal use                 | Defaults: compact text, info level                                           |
| Inspect registration/module details | `loggerOptions: { level: "DEBUG" }`; also `traceModules: true` for discovery |
| Collect structured records          | `logging: { format: "json" }`                                                |
| Follow full request/connection IDs  | `logging: { detail: "full" }`                                                |
| Narrow terminal                     | `logging: { width: 64 }`                                                     |
| Change error stacks                 | `logging: { stacks: "off" \| "short" \| "full" }`                            |

Environment equivalents:

| Variable             | Values                                     | Default                           |
| -------------------- | ------------------------------------------ | --------------------------------- |
| `VIRELLO_LOG_LEVEL`  | debug/info/warn/error; notif/alert aliases | info                              |
| `VIRELLO_LOG_FORMAT` | text/json                                  | text                              |
| `VIRELLO_LOG_DETAIL` | compact/full                               | compact; debug defaults to full   |
| `VIRELLO_LOG_STACKS` | off/short/full                             | short                             |
| `VIRELLO_LOG_LAYOUT` | auto/badge/bar/box                         | auto                              |
| `VIRELLO_LOG_WIDTH`  | Integer 32–200                             | Terminal capped at 120; pipes 100 |

Explicit options win over environment defaults. Invalid environment values use
defaults. `NO_COLOR`, `TERM=dumb`, `FORCE_COLOR=0`, and `colors: false`
disable colour. JSON has no text layout or colour.

## Follow an operation

```text
Login queued     → waiting for an IDENTIFY slot
Login permitted  → allowed to start a new Discord session
Login confirmed  → shard reported readiness
```

Those are separate records. A permit is not proof of a successful connection.

| Record                            | Useful context                                                      |
| --------------------------------- | ------------------------------------------------------------------- |
| Request dispatch / outcome        | Shared `requestId`; `routeId` identifies the destination invocation |
| Host connection / reconnect       | `connectionId` changes after reconnect                              |
| Client ready                      | Shard, loaded command count, cached guild count                     |
| Registration failure              | Command/scope and original error cause                              |
| Coordinator waiting / maintenance | Reason/code and affected host/shard                                 |

JSON records contain `timestamp`, `level`, `component`, `event`, `message`
and optional `context`/`error`. Compact text may show a shortened reference;
use detailed text or JSON for complete IDs. Broadcasts have one request per
destination.

## Bring your logger

```ts
import { Logger, VirelloClient } from "virello/client";

const logger = new Logger({ name: "My bot", level: "NOTIF" });
const client = new VirelloClient({ intents: [], logger });
await client.destroy();
await logger.close(); // You supplied it, so you own it.
```

A custom logger needs `debug`, `notif`, `alert` and `error` methods.
Client, coordinator and host preserve the supplied instance and its settings.
They never close it. Framework-created loggers are closed during cleanup.

Custom loggers receive contextual strings or Errors retaining the original
cause. The default formatter bounds error trees and removes sensitive fields;
it is not a filter for arbitrary payloads you log yourself. Explicit native
format/serialize hooks take ownership of presentation and redaction.

Native themes, symbols, transports and file rotation remain available through
`LoggerOptions`. File JSON uses the logger's envelope; its message contains the
canonical Virello JSON record. [Formatting implementation](../src/core/logging/format.ts)

## Preview without connecting

```sh
bun scripts/logging-demo.ts --width=64
bun scripts/logging-demo.ts --full
bun scripts/logging-demo.ts --json
```

The demo is synthetic. For a running bot, see [troubleshooting](troubleshooting.md).
