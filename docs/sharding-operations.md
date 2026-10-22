# Observe and restart local shard processes

[Docs](README.md) / [Sharding](sharding.md) / Operations

Virello exposes operational APIs from `virello/sharding`. They use the existing
authenticated coordinator, Bun IPC, lease ownership and IDENTIFY budgeting.
There is no second sharding dependency or remotely evaluated application code.

## Status and lifecycle subscriptions

Read `manager.status`, `coordinator.status` or `client.sharding.status` for a
detached, recursively frozen snapshot. These contain no transport credentials,
bot tokens, request payloads or process handles.

```ts
const unsubscribe = manager.onLifecycle((event) => {
	if (event.type === "restart") {
		console.log(event.status.phase, event.status.completed);
	} else {
		console.log(event.status.processes);
	}
});
console.log(manager.status);
// Later, when the application no longer needs this subscription:
unsubscribe();
```

The coordinator and client link also expose `onLifecycle`, emitting `status`
events for lifecycle transitions. Observers receive future snapshots, not a
replay. Delivery occurs in a microtask; an observer cannot delay a transition.
Thrown errors and rejected observer promises are logged and isolated. Remove
subscriptions with the returned callback; closure removes them after its final
event. Subscribe before `start()` or `login()` to observe startup.

`processes[].state === "running"` means the local assignment is reconciled.
`manager.status.processes[].gatewayReady` additionally requires a ready metric
received in the last 15 seconds. `coordinator.status.gatewayReadyShards` uses the
same freshness limit, while `workers[].shards` lists registered routing targets.
Read the current snapshot to evaluate freshness: there is no event for every
clock tick or request-count change. Use [stats](sharding-stats.md) for fresh
requested process samples.

## Controlled restarts

Invoke restart helpers explicitly in the supervisor process that owns the
children. Slot numbers come from `manager.processes`; slots and Discord shard
IDs are different identifiers.

```ts
const replacement = await manager.restartProcess(0, {
	timeoutMs: 120000,
	signal: shutdownController.signal,
});
console.log(replacement.slot, replacement.shard, replacement.pid);

// Alternatively, restart selected slots or all known local slots, sequentially:
await manager.restartProcesses([0, 1], { timeoutMs: 300000 });
await manager.restartAll({ timeoutMs: 300000 });
```

Each slot follows the same sequence:

1. Request the existing graceful child shutdown, with the existing bounded
   escalation if it does not exit.
2. Confirm process exit and coordinator acknowledgement of its released lease.
3. Start one replacement through the normal supervisor and lease protocol.
4. Await reconciliation and a fresh gateway-ready sample before advancing.

Dormant replacements only await reconciliation. `waitForReady: false` explicitly
selects reconciliation-only completion, useful for an offline handler process.
The coordinator decides the replacement's lease; the result reports its actual
shard ID and may be dormant if capacity or ownership changed. No shard is stolen
from another process. Login still consumes the normal IDENTIFY allowance and
may exceed the caller's restart deadline if the allowance is exhausted.

One timeout covers all selected slots (default 300000 ms, maximum 3600000 ms).
Only one explicit restart operation runs per manager; another gets `BUSY`.
Disconnects, coordinator topology changes, closure, cancellation and the first
slot failure stop further manual replacements. The latest progress remains in
`manager.status.restart`, with completed slots and the failing/current slot.
Automatic crash recovery is suppressed for selected slots during the operation.

Cancellation and timeout end the caller's wait; they are not rollback. A child
already asked to stop continues bounded cleanup. A replacement already spawned
remains supervised. No later slot is started by that operation. An unconfirmed
old process exit never permits an overlapping replacement; retrying a still
stopping slot gets `BUSY`. Coordinate cross-host maintenance in your deployment
application; these helpers affect only this manager's owned slots.

## Adoption boundary and next architecture step

This milestone adopts Ovencord's useful builder surface and the ideas of guild
routing, lifecycle visibility and awaited process restarts. Virello implements
the operational APIs on its existing transport and supervisors. It retains
per-host authentication/TLS, frame bounds, lease generations, outage maintenance,
fresh session budgets and the existing automatic scaling state machine.

Multi-shard processes are deferred. Today one process owns one client, one
leased shard and one gateway/cache lifecycle. Sharing a process needs a design
for per-shard ownership, readiness, failure isolation and cache dispatch; changing
the process count alone would not implement it. The next step is an offline
prototype with two leased gateways per process, followed by measurements of RSS,
event-loop delay, gateway throughput, restart blast radius and IDENTIFY recovery
against the current one-shard baseline. Keep this opt-in until lease-loss and
drain tests show that each gateway closes before its ownership changes.

Voice, alternate brokers/transports, arbitrary `broadcastEval`, upstream client
replacement and separate scoped packages are outside this change. No performance
benefit has been measured. The ticket flow remains an application example under
`examples/tickets`, not a framework ticket service.
