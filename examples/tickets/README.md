# Ticket flow with first-party builders

This application example follows a Bamu-style flow without adding a ticket
system to the framework. Install only `virello`. Nothing in this folder logs in
or performs a request merely by being imported.

1. A staff member uses `/ticket-panel` to post a Components V2 panel.
2. The button shows a modal with labelled text inputs and optional file uploads.
3. The submission immediately defers an ephemeral response, resolves uploaded
   attachments, downloads bounded evidence, and creates a private channel.
4. An embed and evidence files are sent using Virello REST multipart uploads;
   the deferred response links to the channel.
5. The owner or support uses **Save transcript** to send a text snapshot to the
   configured support archive. The ticket remains open.

## Load it in your bot

Use the existing client and sharding setup. Add these paths to your module globs
(paths below assume `root` is the `examples` directory):

```ts
modules: {
	commands: "{commands,tickets/commands}/**/*.ts",
	listeners: "{listeners,tickets/listeners}/**/*.ts",
},
```

Configure `TICKET_GUILD_ID`, `TICKET_CATEGORY_ID`, `TICKET_PANEL_CHANNEL_ID`,
`TICKET_SUPPORT_ROLE_ID`, and `TICKET_TRANSCRIPT_CHANNEL_ID` in your ignored
environment file. The category, panel and private transcript channel must all
belong to that guild. Grant the bot Manage Channels, View Channel, Send Messages,
Read Message History, Embed Links and Attach Files as appropriate. The support
role and owner receive explicit channel access; the everyone role is denied
View Channel. Server administrators still have Discord's administrative access.

Enable the Guilds intent. For transcripts containing other users' message text,
enable Message Content in the Developer Portal and client intents, with Discord
approval where required. Without it, Discord may omit content, embeds and
attachments from messages; the example cannot reconstruct missing data.

[`commands/ticket-panel.ts`](commands/ticket-panel.ts) demonstrates command
registration and permission checks. [`listeners/tickets.ts`](listeners/tickets.ts)
routes persistent component IDs. [`flow.ts`](flow.ts) contains the payloads,
acknowledgement sequence, native channel creation and transcript export.

## Application boundaries

- No collector state is needed after restart. A channel topic identifies the
  ticket owner; a fresh guild-channel read finds an existing ticket. An in-process
  guard serializes concurrent submissions by the same user. Keep one owner for
  a guild, as the existing shard assignment model does. Cross-process leases and
  durable submission transactions are application work for a production bot.
- REST timeouts can leave an uncertain create result. Inspect the existing
  channel before retrying. Failures after creation keep the channel and report
  its location; the example does not delete channels or user evidence.
- Evidence is capped at three files of 2 MiB each and copied from resolved
  Discord CDN URLs. Discord's actual per-file limits and permissions still apply.
- A transcript contains the most recent 1000 messages, includes native metadata,
  and is limited to 8 MiB. It is plain text with JSON records, not HTML. It records
  attachment URLs rather than archiving bytes; those URLs can expire. Add durable
  storage, retention, moderation, closure and audit policies in your application.
- This example has not been run against Discord as part of the milestone.
