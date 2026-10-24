# Virello

Build a Discord bot with Bun and TypeScript. Put commands, listeners and services
in their own files; Virello loads them and handles their lifecycle.

```sh
bun add virello
```

**[Make your first bot →](docs/getting-started.md)** ·
**[Developer docs](docs/README.md)** ·
**[Run the examples](examples/README.md)**

Requires **Bun >=1.4.2**. The package ships TypeScript directly, with no build step
or Node runtime entrypoint.

> [!NOTE]
> This checkout uses Virello's own gateway, REST, cache and sharding runtime.
> Payload construction uses first-party `virello/builders`; API definitions use
> the bundled `discord-api-types` through `DiscordAPI`. Install only `virello`.
> See the [builder guide](docs/builders.md) and [ticket flow](examples/tickets/README.md).
>
> The native migration is **unreleased**. npm `latest` was `0.1.1` on
> 2026-10-18 and still uses the previous runtime. See the
> [migration guide](BREAKING_CHANGES.md#native-runtime-unreleased) before using
> the native APIs documented here.

## What are you building?

| I want to…                                  | Start here                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Add slash commands, menus or autocomplete   | [Commands](docs/commands.md)                                                                  |
| Parse `!commands` or match message patterns | [Message commands](docs/message-commands.md)                                                  |
| Check permissions and apply cooldowns       | [Checks](docs/checks.md)                                                                      |
| Handle events, buttons or modals            | [Events and interactions](docs/events.md)                                                     |
| Share resources or schedule work            | [Services and extensions](docs/extensions.md) · [Tasks](docs/scheduling.md)                   |
| Translate replies and command labels        | [Localisation](docs/localisation.md)                                                          |
| Run multiple shard processes                | [Sharding](docs/sharding.md)                                                                  |
| Understand caches, limits or failures       | [Caching and limits](docs/caching-and-limits.md) · [Troubleshooting](docs/troubleshooting.md) |
| Find an import or exact option type         | [Public API map](docs/api.md)                                                                 |

## Try it locally

From a clone of this repository, using the project's Bun canary toolchain:

```sh
bun install --frozen-lockfile
bun examples/offline.ts
```

The offline example loads the bot's modules in two child processes, checks shard
messaging, then cleans up. It needs no Discord token. For a real bot, follow the
[example setup](examples/README.md).

Need only a transport, cache, builder or utilities? See the
[standalone packages](docs/packages.md). Installing `virello` still includes the
complete framework through those same implementations.

Working on Virello itself? See [development](docs/development.md),
[repository conventions](AGENTS.md) and [migration notes](BREAKING_CHANGES.md).

## Licence

`MIT AND Apache-2.0`. See the [root licence](LICENSE),
[sharding licence](packages/sharding/src/LICENSE), [debounce licence](packages/util/src/function/debounce/LICENSE)
and attribution comments retained in source files.
