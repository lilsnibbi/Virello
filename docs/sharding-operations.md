# Observe and control local shards

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
`applicationReady` additionally waits for client startup hooks; restart and layout
transitions require stable application readiness. Coordinator outages can leave a
Gateway healthy while `connected`/`reconciled` are false. Inspect assignment,
Gateway state and `blockedCode` separately. Coordinator status also exposes the
recovery gate, admission uncertainty, HTTP pressure and layout transition record.
Read the current snapshot to evaluate freshness: there is no event for every
clock tick or request-count change. Use [stats](sharding-stats.md) for fresh
requested process samples.

## Idle or reconnect one gateway

Use the owning manager to disconnect a problematic shard without unloading its
process or affecting other slots:

```ts
const idle = await manager.setProcessIdle(0, true);
console.log(idle.state, idle.pid); // "idle", same process ID
await manager.setProcessIdle(0, false);
```

The coordinator retains the lease while removing its routing and identify
registration. The child has `client.maintenance === true` and
`client.sharding.id === null` while idle; `manager.processes` retains the reserved
shard ID and reports `state: "idle"`. Resuming reconciles and registers again,
then connects through the usual IDENTIFY scheduler. These calls resolve after
reconciliation, before Discord readiness; observe `gatewayReady` for that.

Idle selection survives coordinator reconnections and child crash recovery in
this manager. Repeating the same selection is harmless. Another idle/resume or
restart operation gets `BUSY` while one is pending. Each handshake uses
`startupTimeoutMs`. A failed or interrupted call does not undo the requested
selection; inspect status and retry when coordination is available. The setting
is local memory and ends with the manager. Topology changes still use the existing
process drain/replacement flow.

To release the reservation while retaining the worker, register
`client.sharding.onRelease` and call `manager.releaseProcess(slot)`. The barrier
must stop new effects and await/reconcile accepted work; cancellation alone is
insufficient. `RELEASE_UNKNOWN` retains ownership and the operation ID. See the
[release contract](sharding-recovery.md#ownership-and-release).

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

1. Preflight session starts for replacement plus rollback and reserve; close
   effect admission. Request graceful child shutdown, with bounded
   escalation if it does not exit.
2. Confirm process exit and coordinator acknowledgement of its released lease.
3. Start one replacement through the normal supervisor and lease protocol.
4. Await reconciliation and continuous application readiness before advancing.
   `stabilityMs` defaults to 5000; tests may explicitly choose zero.

Dormant or deliberately idle replacements only await reconciliation. `waitForReady: false` explicitly
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

## Architecture boundary

Virello keeps its own Coordinator, Host and worker APIs. Typed control frames use
per-host authentication/TLS, bounded pending work, socket byte limits and an IPC
receipt window that bounds bytes accepted by Bun's native queue. No arbitrary
evaluation, new broker or alternate sharding API is introduced. HTTP bodies travel
on a separate bounded transport. See [recovery](sharding-recovery.md) and
[fleet HTTP](sharding-rest.md) for ownership and effect limits.

One managed child process owns at most one Discord shard, one client and one
gateway/cache lifecycle. A dormant child owns no shard; an operator-idled child
retains a reservation without an active gateway. This is an architectural
invariant, including during recovery, restarts and scaling. A supervisor can own
several child processes; it never combines their gateways inside one child.
Multi-shard processes are not planned. Reliability work must preserve process
isolation and prove ownership before starting a replacement.

Voice, alternate brokers/transports, arbitrary `broadcastEval` and upstream client
replacement are outside this change. No performance
benefit has been measured. The ticket flow remains an application example under
`examples/tickets`, not a framework ticket service.
