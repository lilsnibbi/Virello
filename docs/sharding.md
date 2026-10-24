# Hybrid sharding and cross-hosting

Virello exports the **actual upstream classes**, with no replacement coordinator,
worker protocol or second Gateway engine:

| Virello export                                                                                    | Upstream implementation                  |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `ClusterManager`, `ClusterClient`, `Cluster`, `getInfo`                                           | `@ovencord/hybrid-sharding` 1.1.0        |
| `ReClusterManager`, `HeartbeatManager`, `QueueManager`, `DashboardServer`, `AutoResharderManager` | The same hybrid package's plugins        |
| `Bridge`                                                                                          | `@ovencord/cross-hosting` 1.0.8 `Bridge` |
| `CrossHostClient`                                                                                 | cross-hosting `Client` (one per host)    |
| `CrossHostShard`                                                                                  | cross-hosting `Shard` (one per worker)   |
| `HybridSharding`, `CrossHosting`                                                                  | Complete upstream module namespaces      |

These exports exist at the root and `virello/sharding`. `VirelloClient.cluster`
and `.crosshost` are optional attachment points for those exact objects. A
standalone client does not construct them or start Redis/network activity.

## Ownership

The bridge allocates shard groups to hosts. Each host's `CrossHostClient` connects
to it, attaches to one `ClusterManager` with `.listen(manager)`, and supplies its
allocation to that manager. Hybrid spawns Bun child processes; `getInfo()` reads
the worker's assigned shard IDs/count from its environment. The worker attaches
`ClusterClient`, then `CrossHostShard`, and logs in to Discord once.

Discord.js owns Gateway sessions/reconnects, IDENTIFY throttling within each
client, outbound queues, caches and REST scheduling. Hybrid owns process spawn,
respawn, IPC and configured heartbeat/recluster plugins. Cross-hosting owns its
bridge connection/reconnect and host allocation protocol. Virello owns module
and extension lifecycle inside each worker.

There is **no fleet-wide REST limiter or IDENTIFY permit service** in these
libraries. Hybrid's spawn delay is host-local. Deployments must account for the
bot's global Discord limits; this integration does not claim that simultaneous
host startup is globally coordinated. `AutoResharderManager` rejects a custom
shard list/cross-hosting setup and must not be combined with this allocation flow.

## Upstream wiring

These snippets show the intended runtime integration. The current dependency
releases have the [compatibility problems below](#compatibility-findings), so this
is not a claim of a verified production cluster. No live bot or multi-host cluster
was started during this refactor.

On the bridge, using the documented automatic initialization lifecycle:

```ts
import { Bridge } from "virello/sharding";

const bridge = new Bridge({
	host: "127.0.0.1",
	port: 4444,
	authToken: process.env.CLUSTER_AUTH_TOKEN!,
	token: process.env.DISCORD_TOKEN!,
	totalShards: "auto",
	totalMachines: 2,
	shardsPerCluster: 2,
});
bridge.on("error", console.error);
bridge.on("debug", console.log);
bridge.listen();
```

Start hosts after the bridge has initialized its shard data. In 1.0.8 it schedules
initialization five seconds after its ready event; ready alone does not mean an
allocation exists. Keep these eval-capable TCP endpoints on a trusted private
network. They use a shared auth token and do not provide TLS themselves.

On each host:

```ts
import { ClusterManager, CrossHostClient } from "virello/sharding";

const host = new CrossHostClient({
	host: process.env.CLUSTER_BRIDGE_HOST!,
	port: 4444,
	authToken: process.env.CLUSTER_AUTH_TOKEN!,
	agent: "bot",
	rollingRestarts: false,
});
host.on("error", console.error);
await host.connect();
const data = await host.requestShardData({ timeout: 30_000 });
if (
	!Array.isArray(data.shardList) ||
	!data.shardList.length ||
	!data.shardList.every((group: unknown) => Array.isArray(group))
) {
	throw new Error("Bridge did not supply a cluster allocation.");
}
const manager = new ClusterManager("./bot.ts", {
	mode: "process",
	token: process.env.DISCORD_TOKEN!,
	totalShards: data.totalShards,
	totalClusters: data.shardList.length,
	shardsPerClusters: 2,
	shardList: data.shardList.flat(),
	clusterList: data.clusterList,
});
host.listen(manager);
await manager.spawn({ amount: data.totalShards });
```

The bridge response contains groups of shards per cluster. Hybrid's `shardList`
requires flat IDs; `shardsPerClusters` must match the bridge's `shardsPerCluster`.
`connect()` returning and the host's ready event concern its socket, not an
authentication acknowledgment. A successful shard-data response is needed before
spawning. The upstream client handles subsequent reconnects.

In `bot.ts`, using Redis configured through the upstream `REDIS_URL` environment:

```ts
import { VirelloClient, Events, GatewayIntentBits } from "virello";
import { ClusterClient, CrossHostShard, getInfo } from "virello/sharding";

const info = getInfo();
const client = new VirelloClient({
	shards: info.SHARD_LIST,
	shardCount: info.TOTAL_SHARDS,
	intents: [GatewayIntentBits.Guilds],
	// Configure this worker's Virello modules and extensions here.
});
const cluster = new ClusterClient(client);
client.cluster = cluster;
client.crosshost = new CrossHostShard(cluster);
client.once(Events.ClientReady, () => cluster.triggerReady());
await client.login(process.env.DISCORD_TOKEN);
```

The `CrossHostShard` constructor line currently exposes the upstream fork-type
incompatibility in a strict consumer; it is intentionally not hidden by an `any`
cast. `cluster.broadcastEval` is host-local; `client.crosshost.broadcastEval`
uses the attached host's `manager.netipc` to reach other hosts. Pass only trusted
code. Use the upstream IPC reply/request APIs and timeouts; no exactly-once
execution or remote error-delivery guarantee is added.

Shutdown is process-scoped. `await client.destroy()` closes Virello and Discord
resources. Hybrid 1.1.0's worker heartbeat interval/Redis connection and
cross-hosting 1.0.8's reconnect timers lack a complete public dispose API; the
owning process supervisor must terminate the process. Virello does not reach into
private upstream state or start an additional supervisor to compensate.

## Compatibility findings

- Hybrid's declared peer is `@ovencord/discord.js >=14.16.0`, despite its README
  showing imports from `discord.js`. Bun installs that fork (14.16.59 in this
  lockfile). Virello's runtime Client still extends official discord.js; the fork
  is not used as a second running client. `ClusterClient<T>` accepts the official
  instance at runtime, but cross-hosting's `Shard` constructor fixes its type to
  the fork. The strict consumer reports TS2345 at that integration boundary.
- Both packages expose raw TypeScript. Following hybrid's fork peer produces
  740 dependency-source errors under the repository's strict check. Enabling
  `noImplicitOverride` in the worker fixture yields 882 total diagnostics,
  including the constructor mismatch. `skipLibCheck` cannot skip `.ts` source.
  No fake declarations, disabled strictness or patched dependencies conceal this.
- Hybrid marks Redis optional in its manifest but its exports import Redis and
  constructing `ClusterClient` starts a Redis heartbeat unconditionally. Virello
  includes Redis 5.11.0, matching the upstream development version. The default
  endpoint is localhost:6379 unless upstream Redis configuration changes it.
- Cross-hosting 1.0.8's rolling-update handler assigns nested `response.shardList`
  directly to hybrid's flat `manager.shardList`. Automatic rolling restarts remain
  disabled in the example; Virello does not silently replace that handler.
- Cross-hosting parses each TCP data chunk as one JSON message, without stream
  framing. Split/coalesced packets can fail parsing. Its ready event fires during
  socket open, before authentication is acknowledged. These are upstream transport
  limitations, not guarantees Virello can repair with different wiring.

These issues block a clean strict and production-readiness claim for the requested
combination. Resolving them requires upstream fixes or an explicitly chosen
patched dependency revision. Virello has not forked, substituted or reimplemented
the requested libraries.

Reviewed [hybrid documentation and implementation](https://github.com/ovencord/hybrid-sharding/tree/0759471102263fa2a5103b4c329dc781823461d9)
and [cross-hosting documentation and implementation](https://github.com/ovencord/cross-hosting/tree/a97a269d2db2e72dc3701f79de8f6d189a35be80),
as well as the installed 1.1.0/1.0.8 package sources. The cross-hosting README's
`Manager`/`Client` hybrid aliases are outdated; the actual exports used here are
`ClusterManager`/`ClusterClient`.
