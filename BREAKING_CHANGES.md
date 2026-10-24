# Breaking changes: discord.js engine

This unreleased refactor replaces Virello's native Discord implementation. It is
not a compatibility emulation layer. Virello's framework concepts remain, while
Discord objects and behavior come from the peer `discord.js` package.

| Previous API                                                                 | Current API                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@virello/*` packages                                                        | One `virello` package and its feature subpaths                                                                |
| `EngineClient`, `client.engine`, `GatewayShard`, `RestClient`, engine caches | discord.js `Client` managers, `client.rest`, `client.ws`                                                      |
| Custom coordinator, host manager, leases, assignment epochs, fleet REST      | Actual ovencord `Bridge`, `CrossHostClient`, `ClusterManager`, `ClusterClient`, `CrossHostShard`              |
| Native cache maps                                                            | discord.js managers with `.cache`, `.fetch()` and native options                                              |
| Custom entity/context wrappers                                               | Actual discord.js classes; `MessageContext` aliases `Message`, `InteractionContext` aliases `BaseInteraction` |
| Native builder `.toData()` and custom component validation                   | discord.js builders and `.toJSON()`                                                                           |
| REST `{ method, path, form, files: Blob[] }`                                 | `client.rest.post/put/delete(route, options)`; `body`, `appendToFormData`, binary file `data`, `key`          |
| `client.engine.sendGateway(...)`                                             | discord.js presence/member/voice/Gateway APIs, with upstream lifecycle and scheduling                         |
| Custom generic `BitField`                                                    | `NamedBitField`; root `BitField` is discord.js                                                                |
| Modal `getRadioGroupValue` / `getCheckboxGroupValues`                        | `fields.getRadioGroup` / `fields.getCheckboxGroup`                                                            |

`ApplicationCommands` aliases the real `ApplicationCommandManager`; its methods
follow discord.js. Interaction replies and fetches return discord.js results,
including optional callback responses. Channel/message permission checks use
`PermissionsBitField` and native overwrite calculation. Partial objects remain
partial; consumers must narrow or fetch them.

Use `Events.ClientReady` (`clientReady`) and the native Discord event signatures.
`raw` runs in discord.js's dispatch order, before its cache handlers. Use
`shardDisconnect` for the actual close event and shard ID. The old native Gateway
state events, send deadlines, queue capacities and operation-id deduplication are
removed. No arbitrary opcode capability or rate-limit guarantee is recreated.

## REST and builders

Audit reasons use the upstream per-request `reason` option, encoded by discord.js:

```ts
await client.rest.put(`/guilds/${guildId}/bans/${userId}`, {
	reason: "Case 42",
	body: { delete_message_seconds: 0 },
});
await client.rest.post(`/guilds/${guildId}/stickers`, {
	reason: "Add sticker",
	appendToFormData: true,
	body: { name: "Wave", description: "", tags: "wave" },
	files: [
		{ key: "file", name: "wave.png", data: bytes, contentType: "image/png" },
	],
});
```

JSON uploads use `body` without `appendToFormData`. Named parts such as
`target_users_file` use each file's `key`. File-only requests omit `body`.
Use Buffer/Uint8Array or other documented discord.js RawFile data. Native Virello
validation for duplicate multipart keys, audit length, request snapshots and
operation reuse no longer applies; follow discord.js's contract and Discord's
endpoint validation. Each client's REST manager owns its own rate-limit state.

Radio/checkbox group builders remain available, directly from discord.js. Pass
option objects or option builders to `addOptions`; the old option-builder callback
overload is unavailable. `setDefault(true)` requires the boolean argument. Builders
can retain supplied objects; use fresh objects or an explicit `structuredClone`
when independent ownership is required. The old stronger requiredness/snapshot
checks are not claimed for the upstream builders.

## Sharding and release changes

Workers use `getInfo().SHARD_LIST` / `TOTAL_SHARDS`, attach a real `ClusterClient`
and `CrossHostShard`, and report `clientReady` with `cluster.triggerReady()`.
Framework `destroy()` does not terminate an upstream manager or its Redis/timers.
See [the integration and known incompatibilities](docs/sharding.md).

There is no Virello fleet REST scheduler, IDENTIFY permit service, lease fencing,
worker reuse/reassignment protocol or exactly-once request cache. Do not combine
the removed managers with ovencord. A source-only install now needs the
`discord.js` peer. No existing published package or licensing is changed.
