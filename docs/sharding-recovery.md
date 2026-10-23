# Coordination recovery

[Docs](README.md) / [Sharding](sharding.md) / Recovery

Virello retains Coordinator → Host → worker, with one Discord shard per process.
Authority records live in process memory; the HTTP operation history uses Bun
`SQL(":memory:")`. There is no disk persistence, shared lock or automatic failover.
Run one coordinator per bot.

## Contact loss and state loss

| Situation                        | Gateway                                        | Authority                                                       |
| -------------------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| First assignment pending         | No login                                       | Worker waits alive                                              |
| Coordinator contact lost         | Existing session and local RESUME may continue | Sticky ownership; new IDENTIFY and coordinated RPC wait or fail |
| Same coordinator returns         | Existing session remains                       | Exact assignment reconciles                                     |
| Coordinator restarts             | Prior workers may still be connected           | New coordinator is recovery-blocked; inventory is not authority |
| Operator idles a slot            | Gracefully closed; reconnect disabled          | Process and reservation retained                                |
| Release is unresolved            | Gateway admission closed                       | Reservation retained; no successor                              |
| Terminal Gateway error           | Blocked                                        | Worker remains alive and inspectable                            |
| Parent IPC lost or worker wedged | Supervision may terminate worker               | Confirm actual exit before replacement                          |

`client.sharding.isConnected` describes coordination. `client.maintenance`
describes deliberate Gateway suspension, not every network outage. Gateway health,
application readiness, process state and reconciliation are separate status fields.
Healthy Gateway traffic does not imply fleet HTTP or RPC availability.
Application readiness includes completed login hooks; it does not certify a full
member cache. New workers and layout changes use fresh sessions and cache bootstrap.
Only the same worker resumes its retained session/cache. Applications must distinguish
bootstrap, guild unavailability and removal, and keep onboarding idempotent in their
own records. No session transfer, durable event inbox or replay guarantee is provided.

Heartbeat detection normally takes roughly 15–18 seconds; scheduling stalls can
extend it. Contact loss never proves death. `maxDisconnectedLifetimeMs` is ignored.
`reconnect: false` disables coordinator retries while retaining workers and sticky
sessions. A responsive orphan still shuts down on parent IPC loss.

## Restart runbook

Every production start requires this procedure, including first deployment.
Only `development: true` on a new isolated loopback test fleet skips it.

1. Start with the bot's stable `applicationId`. Observe
   `coordinator.status.recoveryRequired === true`.
2. Stop or externally fence **all prior host process trees**, including partitioned,
   paused and abandoned deployments. An empty map or missing heartbeat is not proof.
3. Reconcile outstanding application, database, queue and HTTP effects. Memory loss
   also loses operation IDs, unknown results, cooldowns and IDENTIFY receipts.
   Use external application records; absence here proves nothing. Do not blindly retry.
4. Call the local operator API below with every configured host ID and reviewed evidence.
5. The coordinator waits 5.5 seconds and fetches fresh Discord limits through the
   fleet HTTP queue before opening admission. Without `botToken`, supply a fresh
   `ShardSessionLimit` as the second argument. Start fresh host/worker incarnations.
6. Check identities, readiness, admission and HTTP outcomes before further changes.

```ts
await coordinator.confirmFleetStopped({
	operationId: crypto.randomUUID(),
	hosts: ["host-a", "host-b"],
	evidence:
		"reviewed process-tree termination and external effects: incident 123",
});
```

This is an operator attestation, not an infrastructure fencing API. Never call it
unconditionally from a restart hook. Failed recovery leaves admission closed.
Repeating a completed operation ID within this incarnation is idempotent.
The [runnable example](../examples/README.md) accepts confirmation on local stdin
using a different incarnation ID each start.

## Ownership and release

Assignments include application, layout version/total, epoch, host ID/boot ID,
worker boot ID and deployment ID. Control frames also carry coordinator incarnation
and connection ID. Late messages cannot authorize another incarnation. Capacity
preferences and elapsed time do not confer ownership.

`manager.setProcessIdle(slot, true)` closes one Gateway and removes routing while
retaining the process and reservation. Pass `false` to reconcile and reconnect
through fresh IDENTIFY admission.

`manager.releaseProcess(slot)` additionally relinquishes ownership while retaining
the worker. Register an application effect barrier first:

```ts
client.sharding.onRelease(async (signal) => {
	// Stop new application work, timers and jobs; await or reconcile accepted effects.
	await application.stopAndReconcile(signal);
});
```

Release closes effect admission, cancels unused permits and RPC handlers, waits
for actual local Gateway closure, the application barrier, all tracked handlers
and accepted fleet HTTP work. Cancellation is not proof of completion. A missing
or non-cooperative barrier returns `RELEASE_UNKNOWN` and retains the reservation.
Retry the same manager method to reconcile its original operation ID. Lost
acknowledgements and delayed completions cannot release a successor.

Process exit prevents future local sends; prior external effects may still commit.
Unknown HTTP operations retain execution-key quarantine after lease release.
Raw database calls, jobs and application timers require application-specific
reconciliation. Virello cannot fence a database that ignores its epochs.
The application barrier must also await asynchronous application EventEmitter
listeners: emitting an event does not expose their completion to the native dispatcher.

## IDENTIFY admission

Fresh IDENTIFY gets a one-shot permit immediately before the socket write, scoped
to owner, attempt, coordinator incarnation, budget window and bucket. Its worker
monotonic deadline starts with the request and lasts at most 15 seconds. Delayed
delivery cannot extend it. Consumption and the local write have no asynchronous
wait between them.

Allowance is charged before grant delivery and never refunded. READY is readiness,
not accounting. Sent or revoked-before-send receipts start a 5.5-second bucket
cooldown at receipt. An unknown sender holds its bucket until an exact outcome or
confirmed release/exit. Duplicates do not extend cooldown; stale receipts cannot
clear newer attempts. Contradictory receipts block admission. Expiry requires a
fresh snapshot; time alone does not refill budgets. RESUME needs no IDENTIFY grant.

Terminal codes 4004 and 4010–4014 block Gateway retry without killing the worker.
4004 and authenticated HTTP 401 open the fleet credential circuit. Bounded retry
circuits also stop repeated connection failures; 60 seconds of stable readiness
resets the count. Inspect `blockedCode`, fix configuration and explicitly
idle/reconnect. Credential recovery requires a reviewed fleet restart.

These rules constrain authorized local sends. They cannot prove the order delayed
packets reach Discord. No exactly-once delivery or atomic cross-system effect
guarantee is made.

## Observe and recover

Poll `coordinator.status` for recovery state, term, owned/draining/unknown
assignments, remaining/unresolved admission, credential faults, HTTP pressure and
layout transition phase. Inspect manager process PID, assignment, reconciliation,
Gateway state, blocked code and application readiness. Use bounded
[stats](sharding-stats.md) for fresh samples.

Resolve unknown permits against the original sender or confirm its tree stopped;
do not clear buckets by hand. Reconcile [HTTP uncertainty](sharding-rest.md) before
retrying. Interrupted layouts retain their committed total; never overlap totals.
Coordinator loss requires the restart runbook.

Old `statePath`/`stateDirectory` files remain ignored and untouched. Gateway
idling preserves modules/listeners but resets cache and resume state. Normal close
code 1000 requests session invalidation; local closure cannot prove the remote
peer processed it during a partition.
