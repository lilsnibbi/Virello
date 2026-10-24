# Repository Guidelines

## Project Structure & Module Organization

Virello is a modular Discord framework shipped as raw TypeScript for Bun. There is no build step or Node runtime support.

- `index.ts`: framework barrel; `src/core/public/` contains feature subpaths.
- `src/core/`: client, commands, modules, events, extensions and framework utilities.
- `src/util/`, `src/logging/`: shared helpers and framework logging.
- Discord Gateway, REST, entities, caches, collectors and builders belong to the `discord.js` peer.
- Sharding uses the actual `@ovencord/hybrid-sharding` and `@ovencord/cross-hosting` dependencies, re-exported by `virello/sharding`.
- Only the root `virello` package is published. No public workspaces or scoped Virello packages.
- `scripts/`: validation and single-package release checks; `docs/`: API and integration guidance.

## Build, Test, and Development Commands

Use Bun canary (`bun upgrade --canary`), the project's standard toolchain. From the repository root:

- `bun install --frozen-lockfile`: install locked dependencies.
- `bun check`: check TypeScript without emitting files.
- `bun lint`: run Bun's built-in lint rules.
- `bun fmt --check`: check formatting without writing files.
- `bun fmt`: apply formatting; review changes before committing.
- `bun scripts/ci.ts`: validate types, lint, public exports and formatting.
- `bun release:check`: validate single-package inputs and release metadata.

## Coding Style & Naming Conventions

Use strict TypeScript and the Bun formatting settings in `bunfig.toml`: tabs and an 80-column print width, with Bun's defaults for quotes, semicolons and trailing commas. Bun's built-in linter defines lint rules. Use camelCase directories and functions, and PascalCase classes and class filenames. Keep relative code imports extensionless. Implementation files must import internal modules directly rather than the root or public barrels. Expose supported APIs through the existing named exports.

## Release Validation

Keep release checks independent of test fixtures and examples. Validate package contents and isolated imports with the locked release toolchain before publishing. Do not describe static checks or import probes as runtime test coverage.

## Commit & Pull Request Guidelines

Use Conventional Commits compatible with Release Please, such as `fix(commands): handle missing arguments`. Keep changes focused. PRs should explain behaviour changes, link relevant issues and report validation results. Keep tokens in ignored environment files.
