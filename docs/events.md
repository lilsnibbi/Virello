# Events and interactions

[Docs](README.md) / Events · [Event names and payloads](../src/events/events.ts)

**`listeners/ready.ts`**, loaded through
`modules.listeners: "listeners/**/*.ts"`:

```ts
import { Events, Listener } from "virello/events";

export default class ReadyListener extends Listener<typeof Events.ClientReady> {
	static override options: Listener.Options = {
		event: Events.ClientReady,
		once: true,
	};

	override run(): void {
		this.container.logger.debug(
			"Cached guilds: " + this.container.client.cache.guilds.size,
		);
	}
}
```

The framework already logs readiness. Use your listener for application work.
`event` defaults to the module name, `emitter` to the client and `once` to
`false`. A custom emitter can be an EventEmitter or a client property name.
Missing emitters disable the module. Unloading detaches its subscription.

## Reply to failures

Built-in listeners log errors; they do not send user replies. Add
**`listeners/commandDenied.ts`**:

```ts
import { UserError } from "virello/commands";
import {
	type ChatInputCommandDeniedPayload,
	Events,
	Listener,
} from "virello/events";

export default class CommandDenied extends Listener<
	typeof Events.ChatInputCommandDenied
> {
	static override options: Listener.Options = {
		event: Events.ChatInputCommandDenied,
	};

	override async run(
		error: UserError,
		{ interaction }: ChatInputCommandDeniedPayload,
	): Promise<void> {
		if (interaction.replied || interaction.deferred) return;
		await interaction.reply({
			content: error.message || "You cannot use this command right now.",
			flags: 64, // MessageFlags.Ephemeral
			allowed_mentions: { parse: [] },
		});
	}
}
```

Only show messages you intend users to see. For
`Events.ChatInputCommandError`, the first argument is `unknown`, the second is
`ChatInputCommandErrorPayload`; send a fixed failure message and log the cause.
Use `editReply` after a defer, or `followUp` after an existing reply.

| Flow                      | Useful events                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Slash commands            | `ChatInputCommandDenied`, `ChatInputCommandError`, `ChatInputCommandSuccess`, `ChatInputCommandFinish` |
| Message commands          | `MessageCommandDenied`, `MessageCommandError`, `UnknownMessageCommand`                                 |
| Context menus             | `ContextMenuCommandDenied`, `ContextMenuCommandError`                                                  |
| Autocomplete              | `CommandAutocompleteInteractionError`                                                                  |
| Listener itself fails     | `ListenerError`                                                                                        |
| Component parse/run fails | `InteractionHandlerParseError`, `InteractionHandlerError`                                              |

Use each event's exported payload type; argument lists differ. Listener async
work is caught and reported, but separate event emissions can overlap. Do not
treat event listeners as a serialized job queue.

## Handle a button

This handler expects a button built with `.setCustomId("confirm")`
(or raw `custom_id: "confirm"`). Add
**`interactions/confirm.ts`**, load
`modules.interactions: "interactions/**/*.ts"`:

```ts
import type { ButtonInteraction } from "virello/discord";
import { InteractionHandler, InteractionHandlerTypes } from "virello/events";

export default class ConfirmHandler extends InteractionHandler {
	static override options: InteractionHandler.Options = {
		interactionHandlerType: InteractionHandlerTypes.Button,
	};

	override parse(interaction: ButtonInteraction) {
		return interaction.customId === "confirm" ? this.some() : this.none();
	}

	override async run(interaction: ButtonInteraction): Promise<void> {
		await interaction.reply({ content: "Confirmed.", flags: 64 });
	}
}
```

| Category           | Typical handler input                             |
| ------------------ | ------------------------------------------------- |
| `Button`           | `ButtonInteraction`                               |
| `SelectMenu`       | Any select-menu interaction; narrow the menu type |
| `ModalSubmit`      | `ModalSubmitInteraction`                          |
| `MessageComponent` | Buttons or select menus                           |
| `Autocomplete`     | `AutocompleteInteraction`                         |

`parse()` returns `some(data)` to pass data into `run(interaction, data)`,
or `none()` to skip. The default parse accepts everything in its category.
Multiple handlers can accept one interaction, so make custom-ID filters disjoint
and check ownership/permissions where needed. Only one handler should send the
initial reply.

[Handler contracts →](../src/events/interactions/interactionHandler.ts) ·
[Pagination helpers →](utilities.md#paginate-a-reply)

## Native event payloads

| Event                                                | Callback value                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `Events.MessageCreate`                               | `MessageContext`                                                    |
| `Events.InteractionCreate`                           | `InteractionContext`; narrow with guards                            |
| `Events.MessageUpdate`                               | `{ payload, cached }`; absent update fields stay absent             |
| `Events.MessageDelete` / `MessageDeleteBulk`         | Native `id` / `ids`, `channel_id`, optional `guild_id`              |
| `Events.GuildMemberUpdate`, `VoiceStateUpdate`, etc. | Native Discord dispatch data                                        |
| `Events.Raw`                                         | Full dispatch: `{ op, t, s, d }`                                    |
| `Events.CacheDelete`                                 | Removed entity kind, ID, scope, previous entry and original payload |
| `Events.ClientReady`                                 | Client after fresh READY; `isReady()` is true                       |
| `Events.GatewayState`                                | Native connection state                                             |

Cache changes happen before these callbacks. Event names generally follow
Discord's dispatch names in camelCase; payloads retain snake_case. Fresh READY
and RESUME are different: `Events.Resumed` does not rerun login hooks.

Native context helpers:

| Need                           | Call                                                     |
| ------------------------------ | -------------------------------------------------------- |
| One initial reply              | `await interaction.reply(body)`                          |
| Time for slow work             | `await interaction.deferReply()`, then `editReply(body)` |
| Reply message object           | `await interaction.fetchReply()`                         |
| Another reply                  | `await interaction.followUp(body)`                       |
| Acknowledge a component update | `await interaction.deferUpdate()` or `update(body)`      |
| Open a builder modal           | `await interaction.showModal(modal)`                     |
| Read a modal field             | `interaction.fields.getTextInput("field-id")`            |

Only one handler may claim the initial response. If a transport failure leaves
`replyState === "unknown"`, the response may already exist; blindly retrying
the initial reply is rejected. Reply helpers share that state with the engine.
