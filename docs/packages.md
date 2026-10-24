# Standalone packages

[Docs](README.md) / Packages · [Release and bootstrap instructions](releasing.md)

Install the smallest package that owns the feature you need. All packages ship
raw TypeScript for Bun >=1.4.2, with no build step or Node runtime entrypoint.
They share one version; keep first-party dependencies on that same version.

| Package             | Implementation and primary exports                                                                       | First-party dependencies                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `@virello/builders` | Payload builders and validation                                               | None                                                       |
| `@virello/logging`  | `Logger`, `createConsoleLogger`, `logEvent`, console formatting and redaction                            | None                                                       |
| `@virello/util`     | General helpers, results/options, parsing, timers, binary codecs, iterators, filesystem and HTTP helpers | logging                                                    |
| `@virello/rest`     | `RestClient`, `RestError`, bounded requests, retries, rate limits and multipart uploads                  | util                                                       |
| `@virello/ws`       | `GatewayShard`, `GatewayBlockedError`, Gateway protocol, heartbeats and identify admission               | util                                                       |
| `@virello/cache`    | `CacheStore`, `ScopedCache`, `EngineCache` and gateway dispatch application                              | util, ws                                                   |
| `@virello/engine`   | `EngineClient`, `EngineMessage`, `EngineInteraction`; combines transports and cache                      | cache, logging, rest, util, ws                             |
| `@virello/sharding` | `ShardCoordinator`, `ShardManager`, `ShardError`, typed IPC, admission and fleet REST scheduling         | cache, logging, rest, ws                                   |
| `@virello/core`     | `VirelloClient`, commands, modules, events, extensions and framework Discord helpers                     | builders, cache, engine, logging, rest, sharding, util, ws |
| `virello`           | Aggregate compatibility entrypoint and existing category subpaths                                        | builders, core, engine, sharding, util                     |

External dependencies remain declared by each owner. In particular, builders
owns `zod`/`ts-mixer`, core owns `i18next`/`cron-parser`, and sharding/core own
their ArkType usage. No scoped package imports or depends on `virello`; there
are no package dependency cycles. A standalone REST or Gateway installation
does not install the application framework, engine, cache or sharding.

```sh
bun add @virello/rest
```

```ts
import { RestClient } from "@virello/rest";
import { GatewayShard } from "@virello/ws";
import { EngineCache } from "@virello/cache";
import { EngineClient } from "@virello/engine";
import { ShardCoordinator, ShardManager } from "@virello/sharding";
import { VirelloClient } from "@virello/core";
import { EmbedBuilder } from "@virello/builders";
import {
	Result,
	TimerManager,
	Iterators,
	Binary,
	Parsing,
} from "@virello/util";
```

Install each package you import directly. The example shows alternatives, not a
requirement to install them all. Gateway authentication, intents, identify
admission and explicit resource lifecycles remain the existing engine APIs.
See [engine usage](../examples/engine/README.md), [builders](builders.md), and
[sharding](sharding.md) for complete configurations.

`virello` keeps its existing root API and all current subpaths, including
`virello/engine`, `virello/builders`, `virello/sharding`, `virello/time` and
`virello/utilities`. They re-export their owning workspace, so mixing aggregate
and standalone imports does not create a second cache class, logger state,
framework container, command registry or client guard.

Framework-specific decorators, prompts, pagination, interaction contexts and
module services remain in core. They depend on the framework's shared container
and lifecycle, so placing them in generic util would create a dependency cycle.
Likewise, commands/modules/events/extensions remain one coupled implementation
in core. This split changes ownership and packaging rather than redesigning them.

Package export maps list supported entrypoints explicitly. Util has focused
`/general`, `/time`, `/parsing`, `/result`, `/binary`, `/iterators`, `/async`,
`/collections`, `/filesystem` and `/http` subpaths. Core mirrors the aggregate's
category subpaths. Other explicit transport, logging and sharding subpaths serve
advanced integrations and first-party boundaries; there is no wildcard exposing
every source file. Physical repository paths are not stable public imports.

`bun release:pack` verifies every tarball's exports, sources and exact
internal versions. After packing, `bun release:verify` uses the existing cold
import fixture in temporary consumers: each scoped package installs without
`virello`, every exported subpath imports without opening resources, and the
aggregate shares the same exported identities. Unpublished siblings are supplied
as local tarball overrides; external dependencies are installed with lifecycle
scripts disabled. These checks never publish and do not prove npm permissions
or native Windows execution. Use the locked release toolchain described in the
[release guide](releasing.md).
