# @virello/ws

Independent Discord Gateway WebSocket transport, heartbeats and identify admission for Bun.

```sh
bun add @virello/ws
```

Ships raw TypeScript for Bun >=1.4.2; no build step or Node runtime support.
This package owns its implementation and depends only on the smaller packages
listed in its manifest. It never depends on the aggregate `virello` package.
All public Virello packages use the same version.

`GatewayShard.send(payload, options?)` accepts the application commands described
in the [engine guide](../engine/README.md#outbound-gateway-commands). Await
`shard.start()` before sending. The same validated, bounded FIFO queue handles
readiness, shard ownership, cancellation, deadlines, and Gateway rate limits.
`shard.pendingSends` reports queued commands. Reconnect and stop reject unsent
work; commands are never replayed. Resolution means a local write, with responses
delivered through the shard's dispatch callback.
