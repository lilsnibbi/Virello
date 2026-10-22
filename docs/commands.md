# Slash commands, menus and subcommands

[Docs](README.md) / Commands · [Command](../src/commands/Command.ts) ·
[Registry options](../src/commands/registration/Registry.ts)

Add **`commands/greet.ts`** to the [first bot](getting-started.md):

```ts
import { Command } from "virello/commands";

export default class GreetCommand extends Command {
	static override options: Command.Options = {
		description: "Say hello to someone.",
	};

	override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.addUserOption((option) =>
					option.setName("user").setDescription("Who?").setRequired(true),
				),
		);
	}

	override async chatInputRun(
		interaction: Command.ChatInputCommandInteraction,
	): Promise<void> {
		const user = interaction.options.getUser("user", true);
		await interaction.reply({
			content: "Hello, " + user.username + "!",
			allowed_mentions: { parse: [] },
		});
	}
}
```

## Choose a handler

| User action       | Declare with                               | Handle with                                                 |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Slash command     | `registry.registerChatInputCommand(...)`   | `chatInputRun(interaction, context)`                        |
| User/message menu | `registry.registerContextMenuCommand(...)` | `contextMenuRun(interaction, context)`                      |
| Autocomplete      | Option builder's `setAutocomplete(true)`   | `autocompleteRun(interaction)`                              |
| Prefix command    | No Discord registration                    | [`messageRun(message, args, context)`](message-commands.md) |

A command can implement several handlers. Builders are supplied by the registry;
you can also pass `virello/builders` instances or native snake_case
registration data. Options return native API objects: `user.username` works;
`user.send()` does not. Use `interaction.options.getTargetMessage()` for a
message context menu, or `getTargetUser()` for a user menu.
Autocomplete handlers call `interaction.respond(choices)`; regular handlers
reply, defer or edit a reply themselves.

> [!IMPORTANT]
> Virello does not auto-defer interactions. Reply or defer within Discord's
> [initial response deadline](https://docs.discord.com/developers/interactions/receiving-and-responding#responding-to-an-interaction)
> (3 seconds). After `await interaction.deferReply()`, use
> `await interaction.editReply("Done.")` when the work finishes.

For a user menu, these methods go inside your `Command` subclass:

```ts
override registerApplicationCommands(registry: Command.Registry): void {
	registry.registerContextMenuCommand((builder) =>
		builder.setName("User ID").setType(2), // ApplicationCommandType.User
	);
}

override async contextMenuRun(
	interaction: Command.ContextMenuCommandInteraction,
): Promise<void> {
	await interaction.reply(interaction.options.getTargetUser().id);
}
```

## Registration behavior

| Setting                             | Default / behavior                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Scope                               | Global; `guildIds` on a registration or `ApplicationCommandRegistries.setDefaultGuildIds([...])` selects guilds |
| Empty `guildIds: []`                | Falls back to shared defaults; does not force global scope                                                      |
| `registerCommandIfMissing`          | `true`                                                                                                          |
| `behaviorWhenNotIdentical`          | `RegisterBehavior.Overwrite`: update differing definitions                                                      |
| `RegisterBehavior.LogToConsole`     | Report differences without applying them                                                                        |
| `RegisterBehavior.VerboseOverwrite` | Report detailed differences and update                                                                          |
| `RegisterBehavior.BulkOverwrite`    | Set as the shared default; replaces command lists in affected scopes                                            |
| `idHints`                           | Existing IDs to help match registrations                                                                        |

Registration runs on the first ready event. Failures emit registration error
events; inspect logs even if login succeeds. Removing a source file or changing
scope does not automatically delete the old Discord command in ordinary mode.
Bulk overwrite can remove commands absent from your local definitions.

With managed shards, use a single registration writer, as in
[`examples/registration.ts`](../examples/registration.ts). All shards still load
and execute commands. If a Discord command name differs from the module name,
ensure non-writing shards also have the corresponding name/ID routing aliases
(`addContextMenuCommandIds` or `addChatInputCommandIds`).

## Subcommands

**`commands/settings.ts`** — the built-in `subcommands` extension is enabled
by default. Declare both the Discord shape and the handler mapping:

```ts
import { Subcommand } from "virello/commands";

export default class SettingsCommand extends Subcommand {
	static override options: Subcommand.Options = {
		subcommands: [{ name: "show", chatInputRun: "showSettings" }],
	};

	override registerApplicationCommands(registry: Subcommand.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription("Bot settings")
				.addSubcommand((sub) =>
					sub.setName("show").setDescription("Show current settings"),
				),
		);
	}

	async showSettings(
		interaction: Subcommand.ChatInputCommandInteraction,
	): Promise<void> {
		await interaction.reply("All settings use their defaults.");
	}
}
```

Mappings accept method names or callbacks, per-subcommand checks/cooldowns,
and groups with `type: "group"` and `entries`. `default: true` is useful for
message subcommands. **Keep the inherited `chatInputRun`/`messageRun` methods**:
they perform dispatch. [Mapping types →](../src/extensions/subcommands/types/mappings.ts)

Next: [permissions and cooldowns](checks.md) · [failure replies](events.md#reply-to-failures).
