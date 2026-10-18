# Find an import

[Docs](README.md) / Public API · [Package export map](../package.json)

```ts
import { VirelloClient } from "virello/client";
import { Command } from "virello/commands";
import { Events, Listener } from "virello/events";
import type { MessageContext, ButtonInteraction } from "virello/discord";
import { EmbedBuilder } from "@discordjs/builders";
import { MessageFlags } from "discord-api-types/v10";
```

The root `virello` entrypoint also exports every category below except the
low-level engine. These are named exports; there is no default export.

| Entrypoint             | Main APIs                                                                                                  | Guide                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `virello/client`       | `VirelloClient`, `container`, logging, `version`                                                           | [Client](client.md)                             |
| `virello/modules`      | `Module`, alias modules, stores, registry                                                                  | [Modules](modules.md)                           |
| `virello/commands`     | `Command`, `Args`, arguments, preconditions, registries, patterns, subcommands, command errors             | [Commands](commands.md)                         |
| `virello/events`       | `Events`, `ClientEvents`, `Listener`, `InteractionHandler`, payload types                                  | [Events](events.md)                             |
| `virello/extensions`   | `Extension` and built-in extension classes/options                                                         | [Extensions](extensions.md)                     |
| `virello/services`     | `Service`, `ServiceStore`, `Services`                                                                      | [Services](extensions.md#share-a-resource)      |
| `virello/localisation` | `LocaleManager`, `resolveKey`, `fetchT`, command localisation helpers                                      | [Localisation](localisation.md)                 |
| `virello/scheduling`   | `Task`, `TaskScheduler`, task events, records and contexts                                                 | [Tasks](scheduling.md)                          |
| `virello/sharding`     | `ShardCoordinator`, `ShardManager`, `ShardError`, contracts/options/stats types                            | [Sharding](sharding.md)                         |
| `virello/discord`      | Contexts, collectors, permissions, `Pagination`, `Discord` and `DiscordConstants` namespaces, snowflakes   | [Discord helpers](utilities.md)                 |
| `virello/utilities`    | Result/Option, async queues/events, decorators, filesystem/HTTP; `Utils`, `Parsing`, `Iterators`, `Binary` | [Utilities](utilities.md#other-helper-groups)   |
| `virello/time`         | `Time`, `Duration`, formatting, cron, timers, rate limits, stopwatch                                       | [Time](utilities.md#time-and-small-rate-limits) |
| `virello/validation`   | ArkType `type`, `Type`, `ArkErrors`                                                                        | [Validation](utilities.md#validate-a-value)     |
| `virello/engine`       | `EngineClient`, `RestClient`, `RestError`, `GatewayShard`, cache classes and native contracts              | [Engine](engine.md)                             |

For the full named list, open [`src/public/`](../src/public). Internal paths
such as `virello/src/...` are not supported package imports.

## What does a handler receive?

| Value                                  | Shape                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| Message command / `MessageCreate`      | `MessageContext`: native `.data`, ID getters, reply/edit/delete/react helpers       |
| Interaction command / component        | `InteractionContext`: native `.data`, guards, option resolvers and response helpers |
| Resolved user/member/role/channel      | Native `discord-api-types/v10` object                                               |
| Most gateway events                    | Native snake_case payload; see [event shapes](events.md#native-event-payloads)      |
| Cache lookup                           | `{ complete, data }` or `undefined`                                                 |
| Module stores / returned command lists | Standard `Map` APIs                                                                 |

Builders come directly from `@discordjs/builders`; Discord enums and payload
types come from `discord-api-types/v10`. Declare those packages in your bot
when importing them. Neither is reimplemented by Virello.

## Extend the types

Use `declare module "virello"` for `ArgType`, `Preconditions`, `Tasks`,
`ShardRequests`, `ModuleStores` and `ClientEvents`. Include that file in your
TypeScript project. Import it at runtime too if it registers handlers or has
other side effects.

Type augmentation describes your code; it does not load a module, validate
network input or register a Discord command. Each topic shows the matching
runtime setup.
