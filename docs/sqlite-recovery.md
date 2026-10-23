# Recover disposable coordinator state

[Docs](README.md) / [Sharding](sharding.md) / SQLite recovery

Enable `state` on the coordinator and every manager to recover automatically
after a coordinator restart or a damaged runtime database. Each managed child
still owns at most one Discord shard. There is no backup service or restored
lease authority: Virello reconstructs the current deployment after fencing
previous children.

Set the coordinator's `state` option to this object in the
[coordinator and host examples](sharding.md). This mode requires `botToken`:

```ts
const state = {
	deployment: "my-bot-production",
	directory: "/var/lib/my-bot/coordinator",
};
```

Set the manager's `state` option to this object on host `primary`:

```ts
const state = {
	deployment: "my-bot-production",
	directory: "/var/lib/my-bot/primary",
};
```

Use dedicated local directories, one for the coordinator and one per host.
Windows absolute paths work too. Keep them stable across process restarts, on
a filesystem with working SQLite locks. Do not use network filesystems, cloned
volumes, or two physical machines sharing one host ID. The deployment ID binds
configuration; it is neither a secret nor proof of ownership. Host secrets and
TLS remain required as before. Upgrade all participants together, and stop any
pre-existing deployment before enabling this mode for the first time.

## Automatic recovery

1. The coordinator acquires a local OS-backed SQLite lock and starts a fresh
   random epoch. A previous live or paused coordinator keeps that lock, so a
   successor waits without opening its listener.
2. Every configured host must confirm fencing for that epoch. Managers stop
   their known children, escalate to killing their owned subprocesses after
   the existing shutdown deadline, and await actual process exit.
3. A host also acquires its children's local SQLite gate exclusively. Each
   managed child holds a shared read transaction until OS process exit. An
   orphan or paused child therefore blocks this gate, even after its manager
   crashes. The manager rotates the gate's random generation; a late-starting
   old child then fails before opening its managed gateway.
4. Once every host has acknowledged, the coordinator waits 5.5 seconds, reads
   fresh Discord session limits and reconstructs `runtime.sqlite`. A corrupt,
   missing, or valid-but-old runtime file follows the same barrier. Persisted
   leases are never replayed as authority.
5. Only then do hosts receive activation and create replacement children.
   Lease grants and identify charges are committed before acknowledgment.
   The existing identify buckets, session limits and restart backoff still
   apply. One transport interruption within the same epoch reconciles
   surviving children without rebuilding the deployment.

Initial manager `start()` waits for activation, so start all configured hosts
concurrently. Coordinator `start()` resolves when the recovery listener opens;
read `coordinator.status.recovery` to distinguish `draining`, `rebuilding` and
`active`. `waitingForHosts` names missing shutdown confirmations. These snapshots
also appear through the existing lifecycle subscriptions.

Metadata or runtime-storage failures retry every 30 seconds while new ownership
remains blocked. A live runtime write failure, changed file identity, or changed
epoch/revision starts a fresh reconciliation round. The coordinator checks the
runtime state periodically as well as before grants. No reset grants extra
session starts, and an unexpired in-process allowance is never increased by
recovery. A failed write may consume a permit without delivering it; it is not
refunded.

## What is disposable?

`runtime.sqlite` contains committed topology, lease and remaining-budget
bookkeeping. Its contents are useful for diagnosis, but configuration and fresh
Discord metadata drive reconstruction. Restarts use configured placement or a
fresh scaling decision rather than trusting the old snapshot. There are no
application records or credentials in this database.

Virello may remove only that marked directory's `runtime.sqlite` and its exact
SQLite sidecar filenames, after the shutdown barrier. It does not search for
other SQLite files or clear a parent directory. Existing legacy `statePath`
and `stateDirectory` options are still ignored.

`coordinator.sqlite`, `supervisor.sqlite` and `children.sqlite` are process
interlocks. They are never reset while a process may still exist. Their OS locks
are independent of the disposable snapshot. Corrupt or missing interlocks,
changed directory identity, and changes to the configured host roster fail
closed. Stop and independently confirm termination of **all** previous
deployment processes before replacing these files or changing host IDs. Initial
directory setup can finish after an interruption; unrelated non-empty
directories are rejected.

## Failure limits

A partitioned host cannot acknowledge a new epoch, so other hosts do not take
its shards. Existing host and child watchdogs enforce the configured outage
cutoff when they can run. Reconnection automatically resumes the shutdown
handshake. A responsive orphan exits when its parent IPC disappears. If its
JavaScript loop is stuck, an available supervisor can kill its owned process.

A process paused indefinitely, an unavailable machine, an unkillable kernel task,
or lost interlock storage cannot be proved dead by a coordinator timer. Recovery
then waits for that host/process to return or for external supervision to fence
the entire old process tree or machine. Configure process-tree supervision for
that case. Do not release ownership merely because a deadline passed.

A runtime-only backup rollback is safe because every startup re-fences all
hosts, and a changed epoch/revision during a running incarnation is detected.
Restoring or cloning the **entire** host/VM/interlock directory can defeat local
file identity and OS-lock assumptions. No SQLite file can prove its own absolute
freshness. That requires external fencing before reconnection; it is not an
automatic safe failover supported by this design.

Process exit closes the old local gateway socket. Discord may observe remote
session closure later, and gateway events/application side effects are not
exactly-once. A coordinator epoch does not invalidate a disconnected Discord
session by itself. Keep application idempotency and durable business data in
your application.

The implementation uses [Bun SQLite](https://bun.com/docs/runtime/sqlite) and
[SQLite locking modes](https://www.sqlite.org/pragma.html#pragma_locking_mode).
SQLite recovery adds no external database service or replacement transport.
