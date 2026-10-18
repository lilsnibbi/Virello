# Breaking changes

## Native runtime (unreleased)

Virello now runs its own engine, gateway, REST, cache and sharding.
`@discordjs/builders` constructs payloads; `discord-api-types` defines their
shape. There is no discord.js runtime, compatibility client or fallback.

**Release boundary:** npm `virello@latest` was **0.1.1** on 2026-10-18. That
published release has discord.js as a regular dependency, with no peer
dependencies. These breaking changes describe this branch, not an already
published native release.

### Move a bot

- [ ] Update all shard hosts/coordinators/bot code together.
- [ ] Remove direct `discord.js` / `@discordjs/collection` dependencies your bot
      no longer uses. Keep `@discordjs/builders` and `discord-api-types` for
      your own imports.
- [ ] Replace SDK entity methods with native fields and explicit REST calls.
- [ ] Update event handlers, payload keys, permission helpers and collectors.
- [ ] Review cache limits and missing/partial data handling.
- [ ] Restart the bot and recreate active prompts/pagination sessions.

The package's category entrypoints, module loading, checks, extension hooks,
task scheduling and coordinator protocol remain available.

### Imports and configuration

```ts
import { VirelloClient } from "virello/client";
import type { MessageContext, ButtonInteraction } from "virello/discord";
import {
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
} from "@discordjs/builders";
import { GatewayIntentBits, MessageFlags, Routes } from "discord-api-types/v10";
```

| Previous API                              | Native API                                               |
| ----------------------------------------- | -------------------------------------------------------- |
| `VirelloClient<true>`                     | `VirelloClient`; check nullable `user` / `application`   |
| discord.js `ClientOptions`                | [Virello/native options](docs/client.md)                 |
| `partials`, `makeCache`, `sweepers`, `ws` | Removed and rejected; use `cache`, `rest`, `gateway`     |
| `shards`, `shardCount`                    | `gateway.shard: [id, count]` for explicit standalone use |
| Custom identify throttler                 | `waitForIdentify(id, signal)`; managed clients supply it |
| `client.ws.ping`                          | `client.ping`, nullable before a heartbeat ACK           |
| `client.guilds.cache.size`                | `client.cache.guilds.size`                               |
| `Collection` methods                      | Standard `Map`; e.g. `[...map.values()].find(...)`       |

The client constructor stays offline. `cache` is available immediately;
`engine` and `rest` are available once gateway startup begins. A standalone
`RestClient(token)` supports REST-only scripts without a client login.

### Messages, interactions and payloads

`MessageContext` / `InteractionContext` expose native `.data` plus framework
helpers. Returned users, members, roles and channels are API data, not objects
with manager methods.

| Previous usage                                                           | Replacement                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `allowedMentions`, `repliedUser`                                         | `allowed_mentions`, `replied_user`                                              |
| `nameLocalizations`, `defaultMemberPermissions` in raw registration JSON | `name_localizations`, `default_member_permissions`                              |
| `ephemeral: true`                                                        | `flags: MessageFlags.Ephemeral`                                                 |
| `reply({ fetchReply: true, ... })`                                       | `await reply(...)`, then `await fetchReply()`                                   |
| `interaction.targetUser` / `targetMessage`                               | `interaction.options.getTargetUser()` / `getTargetMessage()`                    |
| `interaction.fields.getTextInputValue(id)`                               | `interaction.fields.getTextInput(id)`                                           |
| `channel.send(body)`                                                     | `client.send(channel.id, body)`                                                 |
| `client.users.fetch(id)`                                                 | `client.fetchUser(id)`                                                          |
| `channel.messages.fetch(id)`                                             | `client.engine.fetchMessage(channel.id, id)`                                    |
| SDK file/path attachment objects                                         | `files: [{ name: "file.txt", data: Bun.file(path) }]`                           |
| SDK member/role/channel camelCase properties                             | Native snake_case; e.g. `member.roles`, `role.permissions`, `channel.parent_id` |

Builder methods stay unchanged. Raw pagination actions use `custom_id`,
`min_values`, etc.; raw button emoji is an object such as `{ name: "▶" }`.
Use `MessageContext.react()` with Unicode, `name:id`, or a custom emoji mention.

Initial responses share the engine's one-response state. A definitive rejection
may permit correction; an ambiguous failure leaves `replyState: "unknown"`.
Do not assume `replied === false` makes a second initial response safe.

### Events, permissions and collectors

Gateway events use camelCase names derived from Discord dispatch names, with
native snake_case payloads. `MessageCreate` and `InteractionCreate` receive
contexts; `MessageUpdate` receives `{ payload, cached }`, not two SDK messages.
`MessageDeleteBulk` receives native `ids`. Fresh readiness is `ClientReady`;
`Resumed` represents session recovery. [Event reference](docs/events.md#native-event-payloads)

Use Virello's `Permissions` for bit masks. Message permission checks can fetch
missing native data; `Discord.canReadMessages`, `canSendMessages`,
`canSendEmbeds`, `canSendAttachments`, `canReact`,
`canRemoveAllReactions` and `canJoinVoiceChannel` now return
`Promise<boolean>`. **Await them.** User-permission decorators check the
invoking user; bot-permission decorators check the bot.

Collectors use native contexts and standard Maps, with bounded pending work and
retained results. Prompt `run()` accepts a channel ID or `{ id }`; choose its
client with the strategy's `client` option (otherwise the active container).
Removed pagination DM-partial warnings have no native equivalent: sending by
channel ID does not depend on a cached channel.

### Cache and statistics

Members default to 1,000 per guild; message caching defaults off.
`get()` returns `{ complete, data }` or `undefined`. Even many accumulated
patches do not prove completeness. Guild metadata stays partial.
[Cache contract and explicit fetches](docs/caching-and-limits.md)

Shard `users` counts distinct users retained through cached members, message
authors, DM recipients and the bot user. It is no longer a user-manager size.
There is no shared REST rate limiter across shard processes. Native engine
handler limits do not include all framework listeners.

## Virello rename

- The framework is now Virello, with package name `virello`. Replace `rilo`
  imports and subpath imports with `virello`; TypeScript declaration augmentation
  must target `virello`. The package is published on npm.
- Rename `RiloClient` and `RiloClientOptions` to `VirelloClient` and
  `VirelloClientOptions`. The previous names are no longer exported.
- Replace the `RILO_` prefix with `VIRELLO_` in environment variables and GitHub
  repository variables, including `VIRELLO_RELEASES` and
  `VIRELLO_TEST_REDIS_URL`.
- Upgrade coordinators, hosts and children together: transport headers and the
  reserved stats request now use `x-virello-*` and `virello:stats`.
- Redis task keys now use `virello:tasks:v1:`. Existing tasks under `rilo:tasks:v1:`
  are not read; drain or migrate them before switching. Branded symbols and
  pagination component IDs also use the new name, so avoid mixing framework
  versions in one application and recreate active pagination messages.
- The Rilo migration below describes the earlier Kairo-to-Rilo rename. When
  migrating directly from Kairo, apply both renames and use the Virello names.

## Rilo rename

- Install `rilo` and update all imports and subpath imports from `kairojs` to
  `rilo`. TypeScript declaration augmentation must target `rilo`.
- Rename `KairoClient` and `KairoClientOptions` to `RiloClient` and
  `RiloClientOptions`. The previous names are no longer exported.
- Replace the `KAIRO_` prefix with `RILO_` in environment variables and GitHub
  repository variables, including `RILO_RELEASES` and `RILO_TEST_REDIS_URL`.
- Upgrade coordinators, hosts and children together: transport headers and the
  reserved stats request now use `x-rilo-*` and `rilo:stats`.
- Redis task keys now use `rilo:tasks:v1:`. Existing tasks in the previous
  namespace are not read; drain or migrate them before switching. Branded
  symbols and pagination component IDs also use the new name, so avoid mixing
  framework versions in one application and recreate active pagination messages.

## Stricter utility types

- Loose value types now use `unknown`; narrow formatter values, translation
  dictionaries, and other untyped data before accessing their properties.
- `ok()` defaults its absent error type to `never`, `err()` defaults its absent
  value type to `never`, and `none` carries `never`. Supply explicit Result
  generics when a consumer needs a particular type for the absent branch.
- Constructor utility types accept arbitrary signatures as constraints. Supply
  the parameter tuple when invoking a value typed as `Ctor`, `AbstractCtor`,
  `Constructor`, or `AbstractConstructor`.
- `PaginatedFieldMessageEmbed.formatItems()` returns the same instance with the
  transformed item type. Continue chaining from that return value.
- Empty interfaces that only renamed another type are now aliases. Extend the
  alias or augment its underlying interface when adding application fields.
  `Tasks`, `ShardRequests`, and `DetailedDescriptionCommandObject` remain
  augmentable interfaces.

## Shard maintenance and coordinator reconciliation

- Upgrade coordinator, hosts and children together. The internal protocol now
  authenticates per-process leases and acknowledges assignment application.
- Coordinator loss retains children and Discord sessions in `client.maintenance`,
  with a default fifteen-minute unreconciled outage cutoff. `reconnect: false`
  retains its explicit stop-on-loss behavior.
- Fixed shard totals remain the default. `workers[].shards` are initial placement
  preferences; leases decide ownership. Distinct authenticated supervisor
  instances can connect together; duplicate sockets for one instance are refused.
- Disconnected leases remain reserved during the coordinator lifetime until the
  owner confirms exit/release. A new supervisor does not prove old children died.
  Restarting the coordinator rebuilds slots without a global grace period, which
  can allow overlapping old and replacement Discord sessions until recovery or
  the outage cutoff. There is no zero-duplicate-processing guarantee.
- Processes without capacity remain dormant, with no Discord session and
  `client.sharding.id === null`. They poll every thirty seconds by default.
  `login()` and transport-only `sharding.connect()` wait for the first assignment.
- Changed totals close the old gateway before reconnecting, even for the same ID.
  Assignment changes reset native entity caches and gateway resume data,
  preserving the client, modules and application listeners. Extension login hooks
  run once; Discord ready events may repeat.
- `ShardProcessStatus.shard` is nullable. `slot` identifies the local process
  position; `maintenance` and `dormant` are new states. Slots are not Discord IDs.
- Coordinator calls fail immediately by default. Use
  `{ waitForCoordinator: true, timeoutMs }` for a bounded wait. Broadcasts share
  one deadline across waiting and all targets. Dispatched calls are never replayed.
- Configure `assignmentPollIntervalMs`, `maxDisconnectedLifetimeMs`, and optionally
  a minimum standby `processCount` on `ShardManager`. Existing crash/backoff and
  opt-in automatic scaling policies remain. Reservations belonging to disconnected
  instances block scaling until reconciled or released.

Disk-backed ownership remains removed. No state migration is needed. See
[shard recovery](docs/sharding-recovery.md) for the full contract and supervision
boundary.
