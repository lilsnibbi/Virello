# Repository Guidelines

## Project Structure & Module Organization

Virello is a modular Discord framework shipped as raw TypeScript for Bun. There is no build step or Node runtime support.

- `src/core/`: client configuration and module lifecycle.
- `src/commands/`, `src/events/`, `src/extensions/`: commands, listeners and built-in extensions.
- `src/sharding/`: transport, coordination and process supervision.
- `src/utilities/`: shared helpers; `src/public/`: category exports exposed through `src/index.ts` and the package export map.
- `tests/`: feature suites, integration tests and `fixtures/`; `examples/`: runnable usage examples.
- `scripts/`: validation and packaging checks; `.github/workflows/ci.yml`: CI and releases.

## Build, Test, and Development Commands

Use Bun canary (`bun upgrade --canary`), the project's standard toolchain. From the repository root:

- `bun install --frozen-lockfile`: install locked dependencies.
- `bun test`: run the test suite.
- `bun check`: check TypeScript without emitting files.
- `bun lint`: run Bun's built-in lint rules.
- `bun fmt --check`: check formatting without writing files.
- `bun fmt`: apply formatting; review changes before committing.
- `bun examples/offline.ts`: check the example bot's modules and shard messaging without Discord.
- `bun --env-file=examples/.env examples/coordinator.ts`: start the example coordinator.
- `bun --env-file=examples/.env examples/host.ts`: start the example bot's shard host.

## Coding Style & Naming Conventions

Use strict TypeScript and the Bun formatting settings in `bunfig.toml`: tabs and an 80-column print width, with Bun's defaults for quotes, semicolons and trailing commas. Bun's built-in linter defines lint rules. Use camelCase directories and functions, and PascalCase classes and class filenames. Keep relative code imports extensionless. Implementation files must import internal modules directly rather than the root or public barrels. Expose supported APIs through the existing named exports.

## Testing Guidelines

Use `bun:test` and name files `*.test.ts` in the relevant feature directory. Shared cleanup lives in `tests/setup.ts`. Add regression tests for changed behaviour; cover failure paths and resource cleanup. Run focused tests with `bun test tests/core/resolvers/string.test.ts`.

No numeric coverage threshold is configured. Complete CI requires zero skipped tests and disposable Redis via `VIRELLO_TEST_REDIS_URL`; run `bun scripts/ci.ts` for that validation.

## Commit & Pull Request Guidelines

There is no Git commit history yet. Use Conventional Commits compatible with Release Please, such as `fix(commands): handle missing arguments`. Keep changes focused. PRs should explain behaviour changes, link relevant issues and report validation results. Keep tokens in ignored environment files and preserve distributed licence notices.
