# Fleet HTTP scheduling

[Docs](README.md) / [Sharding](sharding.md) / HTTP

Managed clients route native REST through a separate authenticated HTTP endpoint
on the coordinator. Control WebSocket and Bun IPC never carry attachments or REST
response bodies. Configure `botToken` on the coordinator for managed Discord
clients. Manual metadata alone supports transport-only workers, not managed REST.

Each assignment gets an ephemeral HTTP capability. The dispatcher revalidates the
complete assignment immediately before every physical send. Drain closes effect
admission even for queued requests. Use TLS beyond loopback.

## Admission and bounds

One process owns the fleet's bot-global rolling 50-request/second allowance,
route aliases, major-parameter scopes, cooldowns and in-flight reservations.
Ordinary requests are conservatively serialized, including unknown bucket aliases.
This favors predictable safety over throughput; no performance improvement or
speculative broker/HA layer is claimed.

Initial unauthenticated interaction callbacks have a separate queue, with
endpoint/token scoping and overall deadlines. Defer interactions early when work
may be slow. Unauthenticated traffic does not spend bot-global allowance.
Native initial callbacks have a 2.5-second budget from local receipt, including
handler time and queueing. This leaves margin within Discord's response deadline;
network delay or saturation can still prevent delivery. Autocomplete and opening
modals need their own supported immediate responses, not a generic deferral.

Deadlines include preparation and queueing (15 seconds by default). HTTP 429 uses
scoped bucket/global cooldowns and bounded retries. Fleet mutations are never
automatically retried after transport failure or 5xx. Authenticated 401 opens the
fleet credential circuit.

Client and service each admit at most 128 requests and 64 MiB of queued body bytes.
Ordinary service requests are capped at 112, reserving request capacity for callbacks;
callbacks have up to eight dispatch slots and their own operation ordering keys.
One request is at most 16 MiB, including at most 8 MiB of attachment data; responses
are at most 1 MiB. The memory history holds at most 10,000 mutation IDs and roughly
32 MiB of successful response data, plus bounded error metadata. Full history
blocks admission rather than evicting unresolved work. Plan a controlled recovery
before those limits; no disk archive is provided.

## Unknown effects and operation IDs

Use stable business IDs for critical mutations:

```ts
await client.rest.request({
	method: "POST",
	path: "/channels/" + channelId + "/messages",
	body: { content: "deployment complete" },
	operationId: deploymentNotificationId,
	executionKey: "channel:" + channelId,
	deadlineMs: 10000,
});
```

A lost response, abort after submission or ambiguous failure is `OUTCOME_UNKNOWN`.
Reusing the same ID returns a recorded result or unresolved state without resending;
a different payload is rejected. Mutations sharing an execution key are ordered.
An unknown effect quarantines that key until reconciled; other keys can progress.
Default keys conservatively use route/major scopes; choose application keys when needed.

In the coordinator's trusted operator process:

```ts
const operation = await coordinator.httpOperation(operationId);
// Inspect the endpoint/business records first. This is not a retry API.
await coordinator.reconcileHttpOperation(
	operationId,
	verifiedResult,
	"verified external outcome and ordering against incident 123",
);
```

All history disappears on restart. IDs cannot prevent duplicates across memory
loss. External business records and the mandatory
[restart gate](sharding-recovery.md#restart-runbook) carry that responsibility.
A stale client may report uncertainty even when the service has an answer; query
using the original ID.

Framework scheduling cannot prevent application code from bypassing it with
another REST client or fetch. Keep fleet bot-token traffic on this dispatcher.
Database fencing, business idempotency and external jobs remain application duties.
