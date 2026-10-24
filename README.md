# Virello

Modular Discord framework shipped as raw TypeScript for Bun. No build step or Node.js runtime support.

```sh
bun add virello
```

Import the framework from `virello`, or install individual `@virello/*` packages for their supported entrypoints.

| Package             | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `@virello/core`     | Clients, commands, modules, events and extensions |
| `@virello/engine`   | Native Discord client                             |
| `@virello/rest`     | REST transport and rate limits                    |
| `@virello/ws`       | Gateway WebSocket transport                       |
| `@virello/cache`    | Entity cache stores                               |
| `@virello/sharding` | Shard coordination and fleet messaging            |
| `@virello/builders` | Discord payload builders                          |
| `@virello/logging`  | Logging and diagnostics                           |
| `@virello/util`     | General utilities                                 |

All packages share one release version. The root package requires Bun >=1.4.4.

## Development

```sh
bun install --frozen-lockfile
bun release:check
```

Validation checks types, lint, public exports and formatting. Release packaging uses the exact Bun revision pinned in `scripts/release-tools/package.json`:

```sh
npm ci --prefix scripts/release-tools --no-audit --no-fund
scripts/release-tools/node_modules/.bin/bun scripts/ci.ts
scripts/release-tools/node_modules/.bin/bun scripts/release.ts pack
scripts/release-tools/node_modules/.bin/bun scripts/release.ts verify
```

These commands create local tarballs and verify isolated consumer imports. Publishing runs separately through the GitHub Actions trusted-publishing workflow, in dependency order from `release-packages.json`.

To publish directly from your machine with npm authentication configured:

```sh
bun release:publish --dry-run
bun release:publish
```

The script checks release inputs, then publishes all packages in dependency order. It stops on the first failure; packages already published remain published. Existing package versions cannot be overwritten.
