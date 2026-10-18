# Message commands and arguments

[Docs](README.md) / Message commands · [Args](../src/commands/arguments/Args.ts)

For `!roll 20`, add **`commands/roll.ts`**:

```ts
import type { MessageContext as Message } from "virello/discord";
import { Args, Command } from "virello/commands";

export default class RollCommand extends Command {
	static override options: Command.Options = {
		aliases: ["dice"],
	};

	override async messageRun(message: Message, args: Args): Promise<void> {
		const result = await args.pickResult("integer", {
			minimum: 2,
			maximum: 100,
		});
		if (result.isErr()) {
			await message.reply("Try !roll with a whole number from 2 to 100.");
			return;
		}
		const roll = Math.floor(Math.random() * result.unwrap()) + 1;
		await message.reply(String(roll));
	}
}
```

In your client options:

```ts
intents: ["Guilds", "GuildMessages", "MessageContent"],
messageCommands: true,
defaultPrefix: "!",
modules: { commands: "commands/**/*.ts" },
```

Enable Message Content in the Developer Portal too, with approval when Discord
requires it. See [privileged intents](https://docs.discord.com/developers/events/gateway#privileged-intents).
Bot/webhook messages are ignored. Prefix commands also require the bot to be able
to view and send in the channel.

## Read arguments

| Call inside `messageRun`                  | Result                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `await args.pick("integer")`              | Next parsed value; throws a user/argument error on failure         |
| `await args.pickResult("integer")`        | `Result`; check `isErr()` or use `match()`                         |
| `await args.rest("string")`               | All remaining positional arguments joined together                 |
| `await args.repeat("user", { times: 3 })` | Up to three users; later parse failure stops with collected values |
| `await args.peek("string")`               | Look ahead; cursor restored after normal resolution                |
| `args.getFlags("quiet", "q")`             | Whether a configured flag was present                              |
| `args.getOption("format")`                | Last option value, or `null`                                       |

Quoted text is one argument. To recognize `--quiet` and `--format=json`, add
`flags: ["quiet", "q"]` and `options: ["format"]` to the command's static options.
Both lists are empty by default. The usual option separators are `=` and `:`.

Built-ins include `string`, `integer`, `number`, `float`, `boolean`, `enum`,
`date`, `url`/`hyperlink`, `user`, `member`, `message`, `role`, `emoji` and
channel variants. Numeric/date/string bounds are inclusive; string bounds measure
length. User/member/message resolution can fetch from Discord. Channel resolution
uses cache. [All names and output types →](../src/commands/arguments/Args.ts)

> [!NOTE]
> `pickResult` handles resolver error results; an exception thrown by a custom
> resolver still rejects. `peek` also cannot restore its cursor after a thrown
> resolver exception. For ordinary validation failures, return an error result.

## Add your own argument

**`arguments/colour.ts`**, loaded with
`modules.arguments: "arguments/**/*.ts"`:

```ts
import { Argument } from "virello/commands";

declare module "virello" {
	interface ArgType {
		colour: "red" | "blue";
	}
}

export default class ColourArgument extends Argument<"red" | "blue"> {
	override run(parameter: string): Argument.Result<"red" | "blue"> {
		if (parameter === "red" || parameter === "blue") return this.ok(parameter);
		return this.error({ parameter, message: "Choose red or blue." });
	}
}
```

Now `await args.pick("colour")` returns `"red" | "blue"`. Ensure the augmentation
file is included in your TypeScript project. For a one-off resolver without a
module file, pass an `Args.make(callback, name)` resolver directly to `pick`.

## Pattern commands

**`patterns/hello.ts`** runs when a message contains the word `hello`:

```ts
import type { MessageContext as Message } from "virello/discord";
import { PatternCommand } from "virello/commands";

export default class HelloPattern extends PatternCommand {
	static override options: PatternCommand.Options = {
		matchFullName: true,
		chance: 100,
		weight: 5,
	};

	override async messageRun(message: Message): Promise<void> {
		await message.reply("Hello!");
	}
}
```

Add `modules.patterns: "patterns/**/*.ts"`, keep `patternCommands` enabled,
and set `messageCommands: true`. Patterns use the same message pipeline but do
not require a prefix. They can also match a message that triggers a prefix command.

Names and aliases are regex strings. `matchFullName` adds word boundaries to
the name only. Candidates run highest weight first; the first passing checks
and chance wins. Defaults are weight `5`, chance `100`, full-name matching
`false`. Explicit weight `0` currently resolves to `5`; chance is not clamped.

[Command checks →](checks.md) · [Message error events →](events.md)
