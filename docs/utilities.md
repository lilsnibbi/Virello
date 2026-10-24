# Useful helpers

[Docs](README.md) / Utilities · [Discord helpers](../packages/core/src/utilities/discord/index.ts)

## Paginate a reply

Inside a slash-command handler:

```ts
import { EmbedBuilder } from "virello/builders";
import { Pagination } from "virello/discord";

await new Pagination(["First item", "Second item", "Third item"], {
	type: "embed",
	embed: new EmbedBuilder().setTitle("Results"),
	entriesPerPage: 1,
	ephemeral: true,
	showSkipButtons: true,
}).send(interaction);
```

`send()` creates/edits the interaction reply and returns a `MessageContext`.
It also accepts a message context. Only the invoking user controls the pages.

| Setting / method                  | Default or effect                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `entriesPerPage`                  | `5`; positive integer                                                              |
| `idleTimeout` / `modalTimeout`    | `60000` ms each                                                                    |
| `ephemeral`                       | `false`; affects fresh interaction replies                                         |
| `type: "container"`               | Components V2, with `Pagination.DATA` and `Pagination.BUTTONS` layout placeholders |
| `onEnd(reason)`, `onError(error)` | Optional callbacks                                                                 |
| `await pagination.stop()`         | Ends collectors/modals and disables controls                                       |

Each instance sends once. Empty/single-page lists stop immediately. Other users
do not reset idle time. Permission or send failures reject; handle them like any
other reply. Button emoji options accept Unicode or custom emoji mentions.

Need custom actions or page callbacks? Use
`Discord.PaginatedMessage`, `Discord.LazyPaginatedMessage`,
`Discord.PaginatedFieldMessageEmbed` or `Discord.PaginatedMessageEmbedFields`
from `virello/discord`. Those helpers accept up to 25 pages and native action
fields such as `custom_id`. Their `idle` setting is a total collector lifetime
(default 14.5 minutes), not an inactivity timeout.

## Send builders and files

For an existing logged-in client and channel ID:

```ts
import { EmbedBuilder } from "virello/builders";

await client.send(channelId, {
	embeds: [new EmbedBuilder().setDescription("Your export is ready.")],
	allowed_mentions: { parse: [] },
	files: [{ name: "export.txt", data: new Blob(["hello"]) }],
});
```

Raw payload fields use Discord's snake_case. Builders retain their normal
methods such as `setCustomId` and `setDescription`.
`Bun.file(path)` also supplies a Blob; URLs and bare path strings are not upload
objects. `Discord.MessageBuilder` is a small fluent message-options helper.

## Wait for a reply

Inside a message-command handler:

```ts
import { Discord } from "virello/discord";

const prompt = new Discord.MessagePrompter("Continue?", "confirm", {
	client: message.client,
	timeout: 10_000,
});
const accepted = await prompt.run(message.channelId, message.author);
await message.reply(accepted ? "Continuing." : "Cancelled.");
```

Strategies: `confirm`, `message`, `number`, `reaction`.
Timeouts and send/reaction failures reject. `explicitReturn: true` includes
the prompt, strategy and selected value. Message/reaction strategies need the
corresponding gateway intents and channel permissions.

Native `MessageCollector`, `InteractionCollector` and `ReactionCollector`
are also exported directly. Filters run in order; collected results use
`Map`. Defaults cap pending work at 128 and retained results at 1,000.
Stop collectors when finished; message/channel/guild deletion and client
shutdown also release their listeners and timers.

## Time and small rate limits

```ts
import { RateLimitManager, Time } from "virello/time";

const limits = new RateLimitManager(5 * Time.Second, 2);
const bucket = limits.acquire("user-id");
if (!bucket.limited) bucket.consume();
// In your resource cleanup:
limits.clear();
```

These are local fixed-window buckets, not Discord HTTP limits. The same
entrypoint includes duration parsing/formatting, timestamps, cron and stopwatch
helpers. [Command cooldowns](checks.md#cooldowns) already manage command buckets.

## Validate a value

```ts
import { type } from "virello/validation";

const input = type({ count: "number.integer >= 1" });
const value = input.assert({ count: 3 }); // Throws for invalid input.
console.log(value.count);
```

## Other helper groups

| Import from `virello/utilities`                  | Use                                                     |
| ------------------------------------------------ | ------------------------------------------------------- |
| `Result` / `Option`, `ok`, `err`, `some`, `none` | Explicit success/failure or optional values             |
| `AsyncQueue`                                     | Pair `await wait()` with `shift()` in `finally`         |
| `Parsing`                                        | Tokenisation, positional arguments, flags and options   |
| `Iterators`                                      | Lazy transforms; consuming an iterator advances it      |
| `Binary`                                         | Buffers, codecs and schema utilities                    |
| `Utils`                                          | General object, string, function and collection helpers |

Use [the public API map](api.md) to find exports; open each helper's source
comments for its exact input/output contract.
