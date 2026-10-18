# Caches and limits

[Docs](README.md) / Caches and limits · [Cache types](../src/engine/cache/types.ts)

For a bot that needs recent messages, add this to its client options:

```ts
cache: {
	membersPerGuild: 1000,
	messagesPerChannel: 50,
}
```

Read through `client.cache`. A lookup returns an entry or `undefined`;
it never starts a network request.

```ts
const entry = client.cache.members.get(guildId, userId);
if (entry?.complete) {
	console.log(entry.data.roles); // Native role IDs.
} else {
	const member = await client.engine.fetchMember(guildId, userId);
	console.log(member.roles);
}
```

Run that snippet after login, with your existing `client`, `guildId` and
`userId`. The explicit fetch can reject; a cache miss is ordinary.

## What stays in memory?

| Cache                  | Default                              | Lookup / setting                                         |
| ---------------------- | ------------------------------------ | -------------------------------------------------------- |
| Guild metadata         | On, until removal/reset              | `guilds.get(id)`; `guilds: false` disables               |
| Channels / threads     | On, until removal/reset              | `channels.get(id)`; `channels: false`                    |
| Roles                  | On, scoped by guild                  | `roles.get(guildId, roleId)`; `roles: false`             |
| Members                | 1,000 per guild, least recently used | `members.get(guildId, userId)`; `membersPerGuild`        |
| Messages               | Off                                  | `messages.get(channelId, id)`; `messagesPerChannel`      |
| Connected voice states | On, scoped by guild/user             | `voiceStates.get(guildId, userId)`; `voiceStates: false` |

Member/message limits are nonnegative integers; zero disables retention.
Members also accept a per-guild limit callback. There is no combined member cap
across guilds. Guild snapshots keep bulk entity lists in their separate caches.
Voice updates need the `GuildVoiceStates` intent; this is state tracking, not
voice/audio support.

A synchronous `policy({ kind, id, scope, data })` can reject writes. Returning
`false` removes an existing entry too. Throwing stops the engine: cache changes
must finish before the event is delivered.

## Partial data is normal

| Operation                                            | Result                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `get()`, writes, recognised gateway member activity  | Refresh LRU position                                           |
| `peek()`, `has()`, iteration                         | Leave LRU position alone                                       |
| Patch missing fields                                 | Entry stays incomplete                                         |
| Full `put()` or full fetch result                    | Promotes the resident entry to complete                        |
| Update a resident object                             | Same entry/data identity; nested objects merge, arrays replace |
| Evict, delete, fresh IDENTIFY, reassignment or close | That resident identity ends                                    |

Treat entries as engine-owned views. Use `structuredClone(entry.data)` when you
need a stable snapshot across an `await`. Omitted fields stay unchanged;
explicit `null` clears a field. Guild metadata is intentionally partial.

Deletes happen before handlers. `cacheDelete` includes the original `payload`
and `previous` entry when one existed. An unavailable guild retains its marker
but loses member and voice-state snapshots.

`fetchMember`, `fetchChannel` and `fetchMessage` write back only if no gateway
dispatch or reset occurred during the request. Otherwise you receive the HTTP
snapshot without overwriting newer gateway state. Permission checks and some
argument resolvers may perform these fetches for you.

## REST requests

Use the engine already owned by your client:

```ts
import { Routes, type APIUser } from "discord-api-types/v10";

const user = await client.rest.request<APIUser>({
	method: "GET",
	path: Routes.user(userId),
	signal: AbortSignal.timeout(5000),
});
```

| `rest` option           | Default                                              |
| ----------------------- | ---------------------------------------------------- |
| `maxPendingRequests`    | 1,024 logical requests, including retries/waits      |
| `maxConcurrentRequests` | 8                                                    |
| `timeoutMs`             | 15,000 per network attempt                           |
| `maxResponseBytes`      | 8 MiB                                                |
| `maxRetries`            | 2, for transport/5xx failures on GET, PUT and DELETE |
| `maxRateLimitRetries`   | 5, for 429 responses                                 |

Queues follow learned Discord bucket headers and channel/guild/webhook major
resources. Global 429 waits are tracked separately for authenticated and
unauthenticated traffic. See Discord's [rate-limit contract](https://docs.discord.com/developers/topics/rate-limits).

POST/PATCH are not automatically replayed after ambiguous transport/5xx failures.
JSON bodies are snapshotted when queued; multipart `files` accepts named Blobs.
A full queue rejects new work. An attempt timeout does not include queueing or
retry delays; pass an abort signal for an overall deadline.

> [!NOTE]
> REST limits are local to each engine. Sharding coordinates IDENTIFY, not
> shared REST traffic. There is no proactive global requests-per-second budget,
> cross-process REST scheduler, or complete route-sublimit model.

## Three different limits

| Limit                | Protects                    | Scope                                                  |
| -------------------- | --------------------------- | ------------------------------------------------------ |
| Command cooldown     | Your command's usage policy | One command instance in one process                    |
| Discord REST buckets | HTTP requests               | Learned headers within one engine                      |
| IDENTIFY permits     | New gateway sessions        | Local engine gate; coordinator permits in managed mode |

Changing a command cooldown cannot fix an HTTP 429. Increasing REST concurrency
cannot make a shard identify sooner. [Checks](checks.md) · [Sharding](sharding.md)
