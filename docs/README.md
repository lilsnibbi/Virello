# Developer docs

**New bot? [Start with a working /ping command](getting-started.md).**
Already have one? Pick the task below.

| Build                                        | Use                                      |
| -------------------------------------------- | ---------------------------------------- |
| Create a client and choose options           | [Client configuration](client.md)        |
| Load files and manage their resources        | [Modules and lifecycle](modules.md)      |
| Build embeds, components, modals and uploads | [Builders](builders.md)                  |
| Add slash commands, menus and subcommands    | [Commands](commands.md)                  |
| Read message arguments or match regexes      | [Message commands](message-commands.md)  |
| Gate commands and handle denials             | [Checks and cooldowns](checks.md)        |
| Listen to events or handle components        | [Events and interactions](events.md)     |
| Share a resource or add a client feature     | [Services and extensions](extensions.md) |
| Run delayed, repeating or shared jobs        | [Scheduled tasks](scheduling.md)         |
| Translate replies and Discord command labels | [Localisation](localisation.md)          |
| Add pagination, validation or other helpers  | [Utilities](utilities.md)                |

| Operate                                        | Use                                              |
| ---------------------------------------------- | ------------------------------------------------ |
| Split a bot into coordinator, hosts and shards | [Sharding](sharding.md)                          |
| Send typed messages between processes          | [Shard messaging](shard-messaging.md)            |
| Recover after disconnects and restarts         | [Maintenance and recovery](sharding-recovery.md) |
| Change shard counts on existing hosts          | [Automatic scaling](sharding-scaling.md)         |
| Collect live process and cache metrics         | [Shard statistics](sharding-stats.md)            |
| Observe lifecycle or restart owned processes   | [Operational APIs](sharding-operations.md)       |
| Understand memory and rate limits              | [Caching and limits](caching-and-limits.md)      |
| Read logs or supply a logger                   | [Console logging](console-logging.md)            |
| Find why something did not load or reply       | [Troubleshooting](troubleshooting.md)            |

**Reference:** [Public API map](api.md) · [Native engine](engine.md) ·
[Working examples](../examples/README.md) · [Development](development.md) ·
[Breaking changes](../BREAKING_CHANGES.md)

## Reading or generating code from these docs

- These pages describe the code in this checkout. For an older installed
  version, use the docs shipped in that package or its matching Git tag.
- Copy complete file examples as named. Smaller examples say which handler,
  options object or existing client they extend.
- API names and option keys are literal. Durations are milliseconds unless a
  field says otherwise. “Default” means what the implementation does when omitted.
- Import only the [public entrypoints](api.md). Type augmentation belongs on
  `"virello"`, even when runtime imports use a subpath.
- Each topic links to the relevant public types or implementation for details.
  `client.engine` is the same native engine that powers the framework. Use
  `virello/engine` when you need its lower-level types or a standalone client.
