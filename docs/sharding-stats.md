# Fresh shard statistics

[Docs](README.md) / [Sharding](sharding.md) / Statistics ·
[Sample types](../src/sharding/types.ts)

From a managed bot command/listener, or a connected host via `manager.stats()`:

```ts
import { container } from "virello/client";

const results = await container.sharding.stats(undefined, {
	timeoutMs: 5000,
});
let guilds = 0;
let responding = 0;
for (const [shard, result] of results) {
	if (result.ok) {
		guilds += result.value.guilds;
		responding++;
	} else {
		console.warn("Shard", shard, result.error.code);
	}
}
console.log({ guilds, responding, expected: results.size });
```

`stats()` asks every configured ID. `stats(1)` asks only shard 1 and still
returns a `ReadonlyMap<number, ShardStatsResult>`. An invalid ID rejects with
`TARGET`.

## What a sample means

| Field                | Meaning                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `sampledAt`          | Unix ms on the destination clock; host clock skew is possible                                                      |
| `ready`              | Discord readiness when sampled                                                                                     |
| `guilds`, `channels` | Resident local cache entry counts                                                                                  |
| `users`              | Distinct IDs found in cached members, message authors, DM recipients and the bot user; not a standalone user cache |
| `pingMs`             | Latest heartbeat latency, or `null`; does not trigger a new heartbeat                                              |
| `uptimeMs`           | Since the client last became ready, or `null` while not ready                                                      |
| `pid`                | Host-local OS process ID                                                                                           |
| `processUptimeMs`    | Since Bun started                                                                                                  |
| `memory`             | Bytes: `rss`, `heapTotal`, `heapUsed`, `external`, `arrayBuffers`                                                  |

Do not add memory fields together: they overlap. Cache counts depend on intents,
cache settings and received events; they are not a fresh REST census.
A shard can successfully answer with `ready: false`.

> [!IMPORTANT]
> Failed shards contribute **unknown** values, not zeros. Totals from successful
> responses are partial. Samples are fresh but not a simultaneous snapshot.

## Collection behavior

- Every call routes through the coordinator, including a self request. There
  is no local/cache/scaling-metrics fallback.
- The target set is captured from the reconciled shard count at collection
  start. Dormant process slots are not shard IDs.
- One deadline covers coordinator waiting and all targets, with up to eight
  requests in flight. Default: `limits.timeoutMs` (15 seconds).
- Queued targets that miss the deadline get `TIMEOUT`; late replies are ignored.
  Dispatched requests are never replayed.
- The map, entries, samples and errors are frozen and detached from live state.
  The map is a read-only view, not a mutable JS `Map`; use `[...results]` for
  an array. Copy error `code`/`message` explicitly when serializing.

The request name `virello:stats` is reserved. You do not register its handler.

## Failure boundaries

Before collection starts, invalid options or unavailable local coordination
reject the promise. Unmanaged/maintenance callers get `DISCONNECTED` by default;
closed callers get `CLOSED`. To wait briefly, pass
`{ waitForCoordinator: true, timeoutMs: 5000 }`.

After collection starts, failures become per-shard entries:

| Code           | Meaning                                                |
| -------------- | ------------------------------------------------------ |
| `UNAVAILABLE`  | No ready route, exited shard or missing stats provider |
| `TIMEOUT`      | Collection budget expired                              |
| `DISCONNECTED` | Required connection lost                               |
| `CAPACITY`     | Queue or handler bound reached                         |
| `RESHARDING`   | Topology is draining                                   |
| `ABORTED`      | Caller cancelled; already completed samples remain     |
| `PROTOCOL`     | Malformed stats response                               |
| `HANDLER`      | Destination sampler threw                              |

Other transport codes can also appear. If topology changes during collection,
retry after [reconciliation](sharding-recovery.md) to sample the new assignment.
