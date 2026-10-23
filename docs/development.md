# Work on Virello

[Docs](README.md) / Development · [Repository rules](../AGENTS.md)

```sh
bun upgrade --canary
bun install --frozen-lockfile
bun check
bun lint
bun fmt --check
bun examples/offline.ts
```

The package is raw TypeScript for Bun. There is no build step and no Node runtime
entrypoint. A separate bot installs the published package with `bun add virello`;
you do not need a local checkout to use the framework.

## Where does code belong?

| Directory                      | Owns                                                            |
| ------------------------------ | --------------------------------------------------------------- |
| `packages/builders/`           | Standalone payload builders, validation and retained notices    |
| `src/core/`                    | Client configuration, modules, lifecycle, logging               |
| `src/engine/`                  | Native gateway, REST and cache                                  |
| `src/discord/`                 | Framework message/interaction contexts, collectors, permissions |
| `src/commands/`, `src/events/` | Routing, arguments, checks, registration and listeners          |
| `src/extensions/`              | Localisation, tasks, patterns, subcommands and services         |
| `src/sharding/`                | Coordinator, process supervision, transport and recovery        |
| `src/utilities/`               | Shared helpers and payload/pagination utilities                 |
| `src/public/`                  | Supported category exports                                      |
| `tests/`, `examples/`          | Regression fixtures and runnable usage                          |

Use tabs and an 80-column print width. Run `bun fmt` to format; review the diff.
Internal implementation imports should point to their owning modules, not public
or root barrels. Cross-package imports use the owning package's supported
exports. Keep relative code imports extensionless.

## Check the change you made

```sh
bun test tests/core/resolvers/string.test.ts
bun test tests/engine/client.test.ts
bun examples/engine/offline.ts
```

Choose the existing files relevant to your change. The engine example runs a local
fake Discord server; the framework offline example runs temporary coordinator,
host and child processes. Neither needs a real token.

For a full CI-equivalent run, use a **disposable** Redis instance:

```sh
bun scripts/ci.ts
```

Set `VIRELLO_TEST_REDIS_URL` first. CI requires zero skipped tests, frozen
dependencies, type/lint/format checks, examples and package/export validation.
[The workflow](../.github/workflows/ci.yml) defines the current release gates.
See [npm releases](releasing.md) for shared versioning, laptop bootstrap and
per-package trusted-publisher setup.

## Prepare a change

- [ ] Keep unrelated work out of the diff.
- [ ] Update the relevant topic page and runnable examples when APIs change.
- [ ] Keep public exports and `tests/fixtures/public.json` in sync deliberately.
- [ ] Describe breaking field/signature changes in [BREAKING_CHANGES](../BREAKING_CHANGES.md).
- [ ] Keep licences and attribution comments with retained source.
- [ ] Use a Conventional Commit, such as `fix(commands): handle missing arguments`.

A PR should explain the changed behavior, validation performed, and remaining
limits. A local check is not evidence of live Discord behavior or a published
npm release.
