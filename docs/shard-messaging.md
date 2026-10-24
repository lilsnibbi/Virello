# Ask another shard

[Docs](README.md) / [Sharding](sharding.md) / Messaging

## Declare and register a handler

**`shardRequests.ts`**:

```ts
import type { VirelloClient } from "virello/client";

declare module "virello" {
	interface ShardRequests {
		guildCount: { input: null; output: { guilds: number } };
	}
}

export function registerShardRequests(client: VirelloClient): void {
	client.sharding.handle("guildCount", () => ({
		guilds: client.cache.guilds.size,
	}));
}
```

Import `registerShardRequests` in every bot process and call it with your client
**before login**. Declaration augmentation gives callers types; the runtime
handler still needs registration in each destination process.

## Call one shard or all of them

Inside a command handler on a managed client:

```ts
const sharding = this.container.sharding;
const one = await sharding.request(0, "guildCount", null, {
	timeoutMs: 5000,
});
console.log(one.guilds);

const all = await sharding.broadcast("guildCount", null, {
	timeoutMs: 5000,
});
for (const result of all) {
	if (result.ok) console.log(result.shard, result.value.guilds);
	else console.warn(result.shard, result.error.code);
}
```

`request()` returns one value or rejects. `broadcast()` returns results in shard
ID order, including explicit failures. Before dispatch starts, failure to prepare
the local coordinator connection rejects the whole operation. A connected
`ShardManager` exposes the same request/requestGuild/broadcast/stats methods.

## Route by guild

Use a guild ID when the caller does not know which shard owns that guild:

```ts
const result = await client.sharding.requestGuild(
	interaction.guildId!,
	"guildCount",
	null,
	{ timeoutMs: 5000, waitForCoordinator: true },
);
```

The same typed handler contract, JSON bounds, cancellation and no-replay rules
apply. Routing uses the latest reconciled total immediately before dispatch,
including after an optional coordinator wait. The guild ID selects a shard; it
does not automatically become handler input or prove guild membership. Include
the guild ID in your declared input when the handler needs it, and enforce your
application's permissions there.

`calculateShardId(guildId, shardCount)` from `virello/sharding` is also available
for diagnostics. It validates positive 64-bit snowflakes and Virello's 1..4096
shard range and performs the shift and modulo with bigint. Do not cache its
result across topology changes.

| Contract             | Meaning                                                                              |
| -------------------- | ------------------------------------------------------------------------------------ |
| Payloads/results     | Plain JSON; send IDs, not Discord objects, Maps, functions or bigint                 |
| Self requests        | Still routed through the coordinator; no local shortcut                              |
| Handler context      | `{ source, signal }`; source is `null` for host-originated requests                  |
| Cancellation         | Caller `signal` stops waiting; handler must observe its context signal to stop work  |
| Validation           | Optional third argument to `handle(name, handler, validate)` validates unknown input |
| Handler registration | Duplicate/reserved names throw; `handle()` returns an unregister callback            |
| Replay               | Dispatched calls are never replayed after disconnect                                 |

## Deadlines and bounds

Set `waitForCoordinator: true` to wait through a short outage:

```ts
const reply = await client.sharding.request(0, "guildCount", null, {
	waitForCoordinator: true,
	timeoutMs: 5000,
	signal: AbortSignal.timeout(5000),
});
```

The budget includes waiting and execution. Broadcasts share one deadline across
all targets and dispatch at most eight at once. Waiting is bounded, not durable
queueing. A timeout does not prove that a remote side effect never happened.

Coordinator `limits` defaults:

| Key                | Default        | Range                                 |
| ------------------ | -------------- | ------------------------------------- |
| `timeoutMs`        | `15000` ms     | `1..300000`                           |
| `maxPending`       | `256`          | `1..4096` operations/handlers         |
| `maxBytes`         | `65536` bytes  | `1024..1048576` per encoded frame     |
| `maxBufferedBytes` | `262144` bytes | `1024..16777216`, at least `maxBytes` |

## Handle failure by code

| `ShardError.code` | Meaning / next step                                                           |
| ----------------- | ----------------------------------------------------------------------------- |
| `DISCONNECTED`    | Local assignment or required connection unavailable; consider bounded waiting |
| `UNAVAILABLE`     | Destination lacks a ready route; inspect its host/process                     |
| `TIMEOUT`         | Deadline expired; inspect slow handlers and queueing                          |
| `CAPACITY`        | A bounded queue/buffer/handler limit was reached                              |
| `RESHARDING`      | Topology is draining; retry only when appropriate for your operation          |
| `TARGET`          | Invalid or out-of-range shard ID                                              |
| `HANDLER`         | Destination handler failed                                                    |
| `CLOSED`          | Caller has been shut down                                                     |

Other transport errors can occur; do not assume this is an exhaustive enum.
Use [fresh stats](sharding-stats.md) for diagnostics and
[maintenance](sharding-recovery.md) for outage policy.
[Messaging implementation →](../packages/sharding/src/messaging.ts)
