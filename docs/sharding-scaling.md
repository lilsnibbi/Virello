# Automatic shard scaling

[Docs](README.md) / [Sharding](sharding.md) / Scaling ·
[Policy implementation](../src/sharding/coordinator/scaling.ts)

Scaling is **off by default**. To enable it, add this to coordinator options:

```ts
scaling: {
	minShards: 2,
	maxShards: 4,
	targetGuildsPerShard: 1000,
},
```

Also set `maxShards` on **every** worker, keep all configured hosts running,
and supply `botToken`. The [example environment setup](../examples/README.md#environment-reference)
shows the same configuration without editing TypeScript.

> [!NOTE]
> Scaling uses capacity on existing hosts. It does not create machines.
> Every topology change drains and restarts all shards, including a change that
> only moves shards between hosts. Expect a temporary interruption.

## Policy options

| `scaling` key          | Default   | Constraint / meaning                                            |
| ---------------------- | --------- | --------------------------------------------------------------- |
| `maxShards`            | Required  | Global ceiling, `1..4096`, bounded by total host capacity       |
| `minShards`            | `1`       | At most maxShards                                               |
| `targetGuildsPerShard` | `0` (off) | Optional average target, up to `2500`; uses cached guild counts |
| `pollIntervalMs`       | `300000`  | Metadata poll; `60000..86400000` ms                             |
| `cooldownMs`           | `1800000` | Between transition attempts; `60000..604800000` ms              |
| `confirmations`        | `3`       | Matching decisions required; `1..100`                           |
| `allowDownscale`       | `true`    | Allows fewer shards inside this opt-in mode                     |
| `rebalanceThreshold`   | `0.25`    | Required peak weighted-load improvement; `0.05..1`              |
| `sessionReserve`       | `0`       | Unspent IDENTIFY allowance beyond transition needs              |
| `drainTimeoutMs`       | `30000`   | Confirm old process exits; `100..300000` ms                     |
| `readyTimeoutMs`       | `300000`  | New gateway readiness; `100..3600000` ms                        |

Each worker's `maxShards` is `1..4096`; optional `weight` defaults to `1`
(range `0.01..1000`). Weight describes relative host capacity.

Initial assignments must still cover the configured `shardCount` once.
In automatic mode that count is a seed: fresh metadata and policy determine
startup placement. No previous topology, cooldown or confirmation history is
restored. Use `minShards` for a floor across restarts.

## How a count is chosen

```text
+ Discord's recommended shard count
+ configured minimum
+ ceil(total cached guilds / target), when enabled
  → take the maximum
  → round up to a multiple of Discord's recommendation
  → check global and host capacity
```

If only the guild target cannot fit, the largest legal count within capacity is
used. A recommendation or minimum that cannot fit blocks with `SCALING_CAPACITY`.

Discord owns [guild-to-shard assignment](https://docs.discord.com/developers/events/gateway#sharding):
`(guild_id >> 22) % num_shards`. Virello moves whole shards between hosts.
Guild targets are averages, not per-shard guarantees. Keep the Guilds intent and
a complete guild cache for useful counts; CPU, memory and event volume do not
drive this policy.

For the same total, measured guild counts and host weights guide placement;
current owners win equal-load ties. A new total initially uses equal estimated
loads, then later polls can rebalance.

## What a transition does

1. Fetch fresh metadata. Require all configured hosts, including standby hosts.
   Downscaling, guild targets and rebalancing also require ready shards with
   metrics no older than 15 seconds. A larger Discord recommendation may repair
   an unready topology.
2. Confirm the plan and cooldown. Require remaining session starts of at least
   `max(currentCount, proposedCount) + sessionReserve` before disrupting children.
3. Return `RESHARDING` for shard RPC/IDENTIFY work. Ask every host to drain and
   confirm actual child exits.
4. Commit the new topology only after all old processes stop. Start new children
   and wait for gateway readiness.

| Failure point                                  | Recovery                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| Capacity/budget/readiness check                | Defer change; keep current children                                         |
| Host disconnect or drain timeout before commit | Retain old topology; unconfirmed exits cannot authorize replacements        |
| Startup failure after commit                   | Keep committed topology and mark `degraded`; normal host recovery continues |
| All new shards recover                         | Return to `idle`                                                            |
| Child restart attempts exhausted               | Fix the cause and replace/restart the affected supervisor                   |

There is no rollback to a different total after new children have started.
A degraded deployment must recover before another scale change.

## Inspect a decision

For an existing coordinator:

```ts
console.log(coordinator.shardCount);
console.log(coordinator.scalingStatus);
await coordinator.checkScaling();
```

Status phases are `disabled`, `idle`, `draining`, `starting`, `degraded`,
with optional `reason` and `targetShards`. Manual checks still respect
confirmations, cooldown and safety conditions; simultaneous checks share a promise.

Size `limits.maxPending` (default 256) for startup IDENTIFY work and
`limits.maxBytes` for assignment frames. These checks run before draining.
The 5.5-second IDENTIFY bucket spacing and the host's maximum 300-second
`identifyTimeoutMs` still apply. More hosts do not increase Discord concurrency.

[Recovery limitations](sharding-recovery.md#restart-tradeoffs) also apply during
coordinator restarts. [Logs](console-logging.md) expose `scaling_status`,
`scaling_failed` and host `reassigned` events.
