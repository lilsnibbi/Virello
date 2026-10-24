# Virello

Virello is a modular Discord framework for Bun. Its `VirelloClient` extends
`discord.js`'s `Client`; commands, listeners and services receive the original
Discord objects. Virello owns the framework lifecycle, module loading, command
routing, preconditions, extensions and utilities.

This branch is an unreleased architecture change. Read [breaking changes](BREAKING_CHANGES.md)
and the [sharding compatibility findings](docs/sharding.md#compatibility-findings)
before adopting it. The pinned ovencord dependencies currently prevent a clean
strict TypeScript consumer check.

```sh
bun add virello discord.js
```

Only `virello` is published. It ships raw TypeScript for Bun >=1.4.4, with no
build step or Node runtime support. `discord.js` is a peer (`^14.27.0`); local
verification uses 14.27.0. Cluster and cross-host implementations are the actual
`@ovencord/hybrid-sharding` 1.1.0 and `@ovencord/cross-hosting` 1.0.8 dependencies.

```ts
import { VirelloClient, Events, GatewayIntentBits } from "virello";

const client = new VirelloClient({
	intents: [GatewayIntentBits.Guilds],
	root: import.meta.dir,
	modules: {
		commands: ["commands/**/*.ts"],
		listeners: ["listeners/**/*.ts"],
	},
});
client.on(Events.MessageCreate, (message) => {
	// This is discord.js's Message, including its managers and methods.
	console.log(message.author.username, message.content);
});
await client.login(process.env.DISCORD_TOKEN);
```

Message commands additionally require `messageCommands: true`, an appropriate
prefix, and the Discord intents required to receive message content. Module
folders are configured explicitly. Built-in extensions remain enabled by default
and can be configured or disabled individually.

- [Framework API and lifecycle](docs/framework.md)
- [Hybrid sharding and cross-hosting](docs/sharding.md)
- [Breaking changes from the native engine](BREAKING_CHANGES.md)
- [discord.js 14.27.0 Client reference](https://discord.js.org/docs/packages/discord.js/14.27.0/Client:Class)

Feature entrypoints are `virello/client`, `commands`, `events`, `modules`,
`extensions`, `services`, `scheduling`, `localisation`, `discord`, `builders`,
`sharding`, `utilities`, `time` and `validation`. These are subpaths of one package.
Use `VirelloClient` for the framework; the re-exported `Client` is discord.js's class.

## Development and local packaging

```sh
bun install --frozen-lockfile
npm ci --prefix scripts/release-tools --no-audit --no-fund
scripts/release-tools/node_modules/.bin/bun scripts/ci.ts
scripts/release-tools/node_modules/.bin/bun scripts/release.ts check
scripts/release-tools/node_modules/.bin/bun scripts/release.ts pack
scripts/release-tools/node_modules/.bin/bun scripts/release.ts verify
```

The locked Bun revision provides the type checker, linter and formatter. `check`
validates the single package's inputs; `pack` creates `.release/virello-0.3.0.tgz`
at the current development version; `verify` installs that tarball in an isolated
temporary consumer and checks cold imports and object identity. These packaging
checks are separate from runtime tests and strict consumer compilation.

For an unpublished revision, clone the exact commit, install frozen dependencies,
and run the same pack command. Transfer the tarball with its commit ID and SHA-256,
then install it in a disposable consumer alongside `discord.js@14.27.0`. Do not
commit machine-specific `file:` dependency paths. No registry publication is needed.

Release automation publishes only the verified `virello` tarball through GitHub
Actions OIDC. `release:publish --dry-run` packs and verifies without publishing;
actual publication remains a separate action. Existing scoped packages are not
unpublished or changed by this refactor.
