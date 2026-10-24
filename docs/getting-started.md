# Your first bot

[Docs](README.md) / Getting started

You'll make one Bun process that answers `/ping`. Sharding can come later.

## Create the project

```sh
mkdir my-bot
cd my-bot
bun init -y
bun add virello
mkdir commands
```

Use **Bun >=1.4.2**. Run the TypeScript files directly with Bun.

> [!NOTE]
> This `/ping` example works with the published package and this checkout.
> npm `latest` was **0.1.1** on 2026-10-18: it bundles discord.js as a regular
> dependency, with no peer dependencies. You do not install it separately.
> This branch removes that runtime dependency; its native APIs are unreleased.
> [Migration details](../BREAKING_CHANGES.md#native-runtime-unreleased).

Install only `virello`. This checkout includes first-party payload builders at
`virello/builders` and the `DiscordAPI` namespace at `virello/discord` for native
types, enums and routes. Command-registration callbacks receive Virello builders.
See [builders and migration](builders.md) for the unreleased builder surface.

## Add these two files

**`commands/ping.ts`**

```ts
import { Command } from "virello/commands";

export default class PingCommand extends Command {
	static override options: Command.Options = {
		description: "Check whether the bot is awake.",
	};

	override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder.setName(this.name).setDescription(this.description),
		);
	}

	override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		await interaction.reply("Pong!");
	}
}
```

**`index.ts`**

```ts
import { VirelloClient } from "virello/client";
import { ApplicationCommandRegistries } from "virello/commands";

const token = Bun.env.DISCORD_TOKEN;
if (!token) throw new Error("Set DISCORD_TOKEN in .env.");

const guildId = Bun.env.DEV_GUILD_ID?.trim();
ApplicationCommandRegistries.setDefaultGuildIds(
	guildId ? [guildId] : undefined,
);

const client = new VirelloClient({
	intents: ["Guilds"],
	root: import.meta.dir,
	modules: { commands: "commands/**/*.ts" },
});

const stop = () => {
	void client.destroy().catch((error: unknown) => {
		client.logger.error(error);
		process.exitCode = 1;
	});
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await client.login(token);
```

The file name gives the command its name: `ping.ts` → `/ping`.
`registerApplicationCommands` declares what Discord should show;
`chatInputRun` handles an invocation. [More command examples →](commands.md)

## Connect it to Discord

- [ ] Create an app in the [Discord Developer Portal](https://discord.com/developers/applications).
- [ ] Install it in a test server with the `bot` and `applications.commands`
      scopes. See Discord's [installation steps](https://docs.discord.com/developers/quick-start/getting-started#adding-scopes-and-bot-permissions).
- [ ] Create `.env` with the bot token and your test server ID:

  ```dotenv
  DISCORD_TOKEN=replace_with_your_bot_token
  DEV_GUILD_ID=replace_with_your_test_server_id
  ```

- [ ] Add `.env` to `.gitignore` before committing.
- [ ] Run the bot:

  ```sh
  bun index.ts
  ```

Wait for registration and readiness logs, then try `/ping` in that server.
This example uses only the `Guilds` intent; message content and member intents
are unnecessary. It receives interactions through the gateway, so an HTTP
Interactions Endpoint URL is unnecessary.

| Want to change…            | Do this                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| Which servers get commands | Keep `DEV_GUILD_ID` for your test server; omit it for global registration |
| Where commands live        | Change `modules.commands`; paths are relative to `root`                   |
| A command or translation   | Restart the process; there is no hot reload                               |
| How failures reach users   | Add [error and denial listeners](events.md#reply-to-failures)             |

> [!TIP]
> Changing guild/global scope does not delete old registrations. Keep the
> previous scope in mind if you see duplicate commands.

Next: [client options](client.md), [module loading](modules.md), or the
[multi-process example](../examples/README.md).
