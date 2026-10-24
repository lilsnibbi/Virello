# @virello/engine

Native Discord client combining REST, Gateway transport and entity caches for Bun.

```sh
bun add @virello/engine
```

Ships raw TypeScript for Bun >=1.4.2; no build step or Node runtime support.
This package owns its implementation and depends only on the smaller packages
listed in its manifest. It never depends on the aggregate `virello` package.
All public Virello packages use the same version.

## Outbound Gateway commands

After `await engine.connect()`, use `engine.sendGateway(payload, options?)`.
Framework clients expose the same method as `client.engine.sendGateway()` after
the `clientReady` event or a completed login.

```ts
import { GatewayOpcodes, PresenceUpdateStatus } from "discord-api-types/v10";

await engine.sendGateway({
	op: GatewayOpcodes.RequestGuildMembers,
	d: { guild_id: guildId, query: "", limit: 0, nonce: "member-sync-1" },
});

await engine.sendGateway({
	op: GatewayOpcodes.PresenceUpdate,
	d: {
		since: null,
		activities: [],
		status: PresenceUpdateStatus.Online,
		afk: false,
	},
});
```

Supported commands are presence updates (3), voice state updates (4), member
requests (8), soundboard requests (31), and channel info requests (43), typed as
`$GatewayCommand`. Authentication and heartbeats remain transport-owned.

Guild commands must target this engine's assigned shard. Soundboard requests must
contain only guilds belonging to that shard. Use existing named
`client.sharding.requestGuild()` handlers to reach another worker, and broadcast a
named handler to update presence on every shard. Presence sends affect the current
session; configure `gateway.presence` for fresh sessions.

The transport snapshots and validates each command, including intent requirements,
guild routing and the 4096-byte JSON limit. It accepts commands only while ready.
`gateway.maxPendingSends` defaults to 128. The FIFO queue reserves five of the 120
connection events per minute for control traffic, limits presence updates to five
per 20 seconds, and full member requests to one per guild per 30 seconds. Server
member cooldowns are observed locally. Discord can still reject a command,
including after a fleet reassignment; consume `RATE_LIMITED` dispatches.

`options.deadlineMs` includes queue residence, defaults to 15000, and must be at
most 300000. `options.signal` cancels an unsent command. Inspect
`engine.pendingGatewaySends` for queued work. Reconnect, closure and reassignment
reject unsent commands. Failed writes are never replayed, and a transport failure
can leave delivery unknown.

The returned promise resolves after the local socket write, without waiting for a
Discord acknowledgement. Listen to `engine.on("dispatch", ...)` for
`GUILD_MEMBERS_CHUNK`, `SOUNDBOARD_SOUNDS`, `CHANNEL_INFO`, voice state updates and
other responses. Member chunk correlation and completion remain caller-owned.
