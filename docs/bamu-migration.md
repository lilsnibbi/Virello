# Bamu migration assessment

[Docs](README.md) / Bamu migration

This is a read-only source assessment of Bamu at
`680f8dabcf923a32137379effe2c84fa43cdba2a`. Bamu was not modified or started.
No Discord, database, Redis or application service was contacted. The reviewed
tree has 221 non-test TypeScript files under `src` importing `discord.js`.
An import substitution would not migrate its runtime behavior.

The ticket example in this repository demonstrates native interaction and REST
semantics. It is not a replacement for Bamu's ticket implementation.

## Concrete gaps

Paths below are relative to Bamu's repository. They identify the observed usage
and the behavior that a later migration must preserve.

| Source                                                                           | Observed usage                                                                                                                               | Virello migration requirement                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/apps/bot/structures/BotClient.ts`                                           | Extends Discord.js `Client`; owns guild managers, application services, RPC and a bounded shutdown sequence.                                 | Extend `VirelloClient`, use native API entities/REST/cache, and retain application-owned startup and drain phases. Do not assume a cached guild is complete or current.                                                               |
| `src/apps/bot/structures/ModuleLoader.ts`                                        | Loads `@lilsnibbi/discord` command/event objects from `*/{commands,events}/*.ts`; reads command `.data.name`.                                | Port discovered entrypoints to Virello modules and registration. Preserve custom-ID dispatch, permissions and duplicate-name handling. Foreign command builders are not Virello builders.                                             |
| `src/apps/bot/ui.ts`                                                             | `ContainerBuilder.setAccentColor` receives an RGB tuple.                                                                                     | Virello currently accepts an integer color. Convert with Bamu's existing `accent()` helper when migrating; do not silently pass the tuple.                                                                                            |
| `src/apps/bot/core/modules/tickets/utils/form.ts`                                | Label-based modals contain radio groups, checkbox groups, selects and file uploads with `file_types`.                                        | Radio/checkbox builders and typed result accessors are missing from Virello's selected builder surface. File-type filters also need explicit builder support and validation. Native payloads do not make these typed APIs equivalent. |
| Same form source                                                                 | Reads `getUploadedFiles`, `getRadioGroup`, `getCheckboxGroup`, `getStringSelectValues`; tracks page and attempt in a form session.           | Virello exposes `fields.getAttachments` and native field access, with different return shapes. Preserve user binding, form version, page/attempt validation, expiry and prior answers in application code.                            |
| `src/apps/bot/core/modules/tickets/utils/response.ts`                            | Chooses `reply` versus `editReply`, uses Components V2 and ephemeral flags, and passes `allowedMentions`.                                    | Keep acknowledgement state and V2 flags explicit; native payloads use `allowed_mentions`. Numeric API flags replace Discord.js flag resolvers. A deferred interaction cannot show another modal.                                      |
| `src/apps/bot/core/modules/tickets/utils/creation.ts`                            | Uses a PostgreSQL advisory transaction lock, checks prior tickets and orphaned channels, then creates a private channel and durable receipt. | Retain the database lock and reconciliation logic. Translate manager calls to REST and native permission overwrites. A shard lease or the example's in-process guard does not provide exactly-once ticket creation.                   |
| `src/apps/bot/core/modules/tickets/utils/transcripts.ts`                         | Captures public and staff history, bounds capture to 10,000 messages/7 MB of text, hashes snapshots and verifies archives before deletion.   | Port pagination to native REST while retaining bounds, advancement checks, snapshot verification and durable archive receipts. Do not replace this with the example's smaller text transcript.                                        |
| `src/apps/bot/core/modules/tickets/utils/transcript-html.ts`                     | Calls `discord-html-transcripts-v2.generateFromMessages` with Discord.js messages/channels and resolves cached users.                        | The renderer requires a separately reviewed native-data adapter or replacement. Virello's attachment builder transports bytes; it does not implement HTML rendering or archive persistence.                                           |
| `src/apps/bot/structures/rpc/native-message-payload.ts` and related RPC handlers | Validate actor and bot permissions, preserve native message fields, compare readback, and handle irreversible Components V2 flags.           | Keep these application authorization and verification boundaries. Route guild-specific work to its owning shard; a successful RPC transport reply alone is not proof of a Discord mutation.                                           |
| `src/apps/bot/structures/InstanceLease.ts` and shutdown phases                   | Uses a Redis instance lease for overlapping deployments and drains application services before exit.                                         | Review deployment ownership separately from Virello shard ownership. A TTL expiring or a control socket disconnecting is not evidence that a previous gateway has stopped.                                                            |

## Migration order

1. Close the concrete modal/field and transcript-rendering gaps with focused
   verification before claiming ticket parity.
2. Port one application-owned ticket path against offline native payloads,
   including retries, stale forms, missing channels and failed archives.
3. Port module discovery, command registration and the application's RPC facade;
   keep persistent database and archive contracts unchanged.
4. Review the deployment handoff and shutdown budget with one shard per child
   process. Do not start a second owner solely because an old lease timed out.
5. Run separately authorized integration validation against isolated services
   before a live migration.

Payments, AI, authorization policy, ticket persistence, uploads and the website
remain Bamu responsibilities. They do not belong in framework ticket modules.
