# Source notices

[Docs](README.md) / Source notices

Virello's package licence is `MIT AND Apache-2.0`. Keep distributed notices
when copying or modifying the affected files.

| Location                                                           | Notice                                       |
| ------------------------------------------------------------------ | -------------------------------------------- |
| [Root LICENSE](../LICENSE)                                         | Project MIT licence                          |
| [Sharding LICENSE](../packages/sharding/src/LICENSE)               | Sharding source licence                      |
| [Debounce LICENSE](../packages/util/src/function/debounce/LICENSE) | Retained utility licence                     |
| Source comments                                                    | Per-file attribution and upstream references |

The first-party builders are adapted from Ovencord revision
`cc6100f8eb01f82509c74b06427a87fea9880911`, including inherited discord.js source.
See [builder NOTICE](../packages/builders/NOTICE), [builder LICENSE](../packages/builders/LICENSE),
[utility LICENSE](../packages/builders/src/util/LICENSE) and
[upstream root LICENSE](../packages/builders/UPSTREAM-LICENSE). These ship with
`@virello/builders`, alongside [Virello's license](../packages/builders/VIRELLO-LICENSE).
Modified files carry adaptation notices. No upstream NOTICE
file was present at the pinned revision. Its private root package.json says MIT,
but the root and relevant package LICENSE files say Apache-2.0; those full texts
and copyright notices are retained.

Virello maintains the adapted code; it does not claim exclusive authorship.
`discord-api-types`, `ts-mixer`, `zod` and other dependencies retain their own
package licences. No Ovencord client, REST or gateway source is included.

The guild-routing, lifecycle-observation and explicit-restart additions use
Virello's existing sharding implementation. Ovencord's `calculateShardId`,
`Shard` and `ShardingManager` APIs informed the design; their process or
transport implementations were not copied. Existing sharding notices remain
intact. The routing calculation is Discord's standard snowflake formula.
