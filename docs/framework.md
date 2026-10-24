# Framework API

The framework remains organized around `VirelloClient`, `Module`, `Command`,
`Listener`, `InteractionHandler`, `Argument`, `Precondition`, and their stores.
Application code imports them from `virello` or its feature subpaths.

## Client lifecycle

`new VirelloClient(options)` accepts discord.js `ClientOptions` together with
Virello's `root`, `modules`, `extensions`, logging and command settings. It
registers framework stores and synchronous extension setup. It does not connect
to Discord or create a cluster manager. One active Virello client owns the shared
`container` in each process.

`load()` loads configured modules once. `login(token)` awaits loading, then
`Extension.beforeLogin`, discord.js login and `Extension.afterLogin`. Concurrent
login calls share one promise. Failed startup runs cleanup. `destroy()` stops
framework producers, unloads modules, disconnects discord.js and closes only the
logger Virello created. Register owned resources with `addDisposer(callback)`.
Upstream cluster workers are process-scoped; see [sharding lifecycle](sharding.md).

The real discord.js `guilds`, `users`, `channels`, `application`, `rest`, `ws`,
`user` and `presence` properties are available. `fetchUser(id)`, `send(channelId,
payload)` and `sendTyping(channelId)` remain small convenience methods delegating
to those managers. Native cache customization (`makeCache`, `sweepers`, `partials`)
and shard options pass through to discord.js.

## Commands and listeners

```ts
import {
	Command,
	type ApplicationCommandRegistry,
	type ChatInputCommandInteraction,
} from "virello";

export class Ping extends Command {
	static override readonly options = {
		name: "ping",
		description: "Check latency",
	};
	public override registerApplicationCommands(
		registry: ApplicationCommandRegistry,
	) {
		registry.registerChatInputCommand((builder) =>
			builder.setName("ping").setDescription("Check latency"),
		);
	}
	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.reply("Pong");
	}
}
```

Registry callbacks and command ID routing remain Virello features. Registration
uses the discord.js application-command manager. Message commands still support
`Args`, aliases, lexer/parser strategies, permission checks and cooldowns. Handler
parameters are real discord.js interactions or messages, including their fields,
manager references, partial-state behavior and methods.

```ts
import { Listener, Events, type Message } from "virello";

export class Messages extends Listener<typeof Events.MessageCreate> {
	static override readonly options = { event: Events.MessageCreate };
	public override run(message: Message) {
		this.container.logger.debug(message.content);
	}
}
```

`Events` combines discord.js event names with Virello's command, module, extension,
listener-error and shutdown events. `ClientEvents` remains augmentable for custom
framework events. Discord event names and argument tuples now follow discord.js.
`virello/discord` exports discord.js's unmodified `Events`; use `virello/events`
or the root for the combined framework constant.

## Preserved custom features

Services and scheduled tasks retain their stores and configured backends.
Localisation still resolves an application locale and loads i18next resources.
Pattern commands and subcommands retain their dispatch and precondition logic.
Custom extensions retain synchronous setup, before/after login hooks, optional
failure handling and disposer rollback.

Pagination, prompts and the `Discord.MessageBuilder` convenience helper now
produce discord.js payloads and use its collectors. Builders expose `.toJSON()`.
Messages use camelCase options such as `allowedMentions` and `reply`. Prompt edits
reject send-only `SuppressNotifications` and `IsVoiceMessage` flags.

General parsing, result/option, iterator, async, binary, HTTP, time, scheduler
rate-limit and logging utilities remain. These utility rate limits are unrelated
to Discord transport scheduling. The generic named-mask helper is `NamedBitField`;
`BitField` and `PermissionsBitField` are discord.js classes.
