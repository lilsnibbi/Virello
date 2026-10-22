# Build Discord payloads

[Docs](README.md) / Builders · [Ticket example](../examples/tickets/README.md)

Install `virello` and import builders from `virello/builders`. These are maintained
Virello sources adapted from Ovencord's builders, with the applicable
[source notices](../src/builders/NOTICE). No Ovencord or discord.js client runs
underneath them. The client, gateway, REST, cache and sharding remain Virello's.
This surface is unreleased; use the checkout until a release includes it.

```ts
import {
	SlashCommandBuilder,
	EmbedBuilder,
	MessageFlags,
} from "virello/builders";
import { DiscordAPI } from "virello/discord";

const command = new SlashCommandBuilder()
	.setName("report")
	.setDescription("Report a problem")
	.addStringOption((option) =>
		option
			.setName("subject")
			.setDescription("A short summary")
			.setRequired(true),
	);

const embed = new EmbedBuilder().setTitle("Report received").setColor(0x5865f2);
// In an interaction handler:
await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
// DiscordAPI also exposes API types, enums and Routes without another installation.
const route = DiscordAPI.Routes.channelMessages(channelId);
```

| Area                   | Builders                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands               | `SlashCommandBuilder` / `ChatInputCommandBuilder`, subcommands, groups and all nine option kinds; concrete `ContextMenuCommandBuilder`, `UserContextCommandBuilder`, `MessageContextCommandBuilder` |
| Embeds                 | `EmbedBuilder`, author, footer and field builders                                                                                                                                                   |
| Interactive components | `ActionRowBuilder`, generic and styled buttons, all five select menus and string options                                                                                                            |
| Components V2          | `ContainerBuilder`, `SectionBuilder`, `TextDisplayBuilder`, `ThumbnailBuilder`, `MediaGalleryBuilder`, `MediaGalleryItemBuilder`, `FileBuilder`, `SeparatorBuilder`                                 |
| Modals                 | `ModalBuilder`, `LabelBuilder`, `TextInputBuilder`, `FileUploadBuilder`                                                                                                                             |
| Messages and uploads   | `MessageBuilder`, `AttachmentBuilder`                                                                                                                                                               |

Builders accept native snake_case constructor data where supported. Setters use
camelCase; `toJSON()` produces a detached native payload and validates it.
Nested children are validated too. Invalid data throws `BuilderValidationError`
or a descriptive `TypeError`/`RangeError`; there is no global validation switch.
Builders do not make HTTP requests or acknowledge interactions.

## Components V2

```ts
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageBuilder,
	MessageFlags,
} from "virello/builders";

const panel = new MessageBuilder()
	.setFlags(MessageFlags.IsComponentsV2)
	.setAllowedMentions({ parse: [] })
	.setComponents(
		new ContainerBuilder()
			.addTextDisplayComponents((text) =>
				text.setContent("## Support\nHow can we help?"),
			)
			.addActionRowComponents(
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setCustomId("support:open")
						.setStyle(ButtonStyle.Primary)
						.setLabel("Open ticket"),
				),
			),
	);

await interaction.reply(panel.toMessage());
```

Set `IsComponentsV2` explicitly. Content and embeds cannot accompany V2
components; put text in `TextDisplayBuilder`. A message allows 40 components
including nested components. `ThumbnailBuilder` belongs in a section accessory;
file upload belongs in a modal label. Legacy action rows still work.
The new message builder covers content, embeds, components, attachments, flags
and allowed mentions. Use native bodies for polls, stickers, other endpoint
fields and partial edits. Existing native bodies remain supported unchanged.

## Modal labels and uploads

```ts
import {
	FileUploadBuilder,
	LabelBuilder,
	MessageFlags,
	ModalBuilder,
} from "virello/builders";

await buttonInteraction.showModal(
	new ModalBuilder()
		.setCustomId("report:submit")
		.setTitle("Report a problem")
		.addLabelComponents(
			new LabelBuilder()
				.setLabel("Evidence")
				.setFileUploadComponent(
					new FileUploadBuilder()
						.setCustomId("evidence")
						.setMinValues(0)
						.setMaxValues(3)
						.setRequired(false),
				),
		),
);

// In the separate modal submission handler:
await modalInteraction.deferReply({ flags: MessageFlags.Ephemeral });
const uploads = modalInteraction.fields.getAttachments("evidence");
await modalInteraction.editReply(`Received ${uploads.length} files.`);
```

Show a modal as the button/command's first response. A modal submission gets
its own acknowledgement; defer it before slow downloads or channel creation.
`fields.getAttachments()` already returns resolved native attachment objects.
It does not fetch their bytes. The ticket example shows bounded downloads and
re-uploading evidence while the signed URLs are still valid.

## Upload a transcript

```ts
import { AttachmentBuilder, MessageBuilder } from "virello/builders";

const transcript = new AttachmentBuilder()
	.setFilename("transcript.txt")
	.setDescription("Conversation transcript")
	.setFileData(
		new Blob([transcriptText], { type: "text/plain;charset=utf-8" }),
	);
const message = new MessageBuilder()
	.setContent("Your transcript")
	.setAllowedMentions({ parse: [] })
	.setAttachments(transcript);

await interaction.editReply(message.toMessage());
// Or use the native REST path:
await client.rest.request({
	method: "POST",
	path: DiscordAPI.Routes.channelMessages(channelId),
	...message.toFileBody(),
});
```

`setFileData` accepts Blob (including `Bun.file`), a copied Uint8Array, or text.
Strings are content, not filenames or URLs. Empty uploads are retained.
`toJSON()` contains attachment metadata only; use `toMessage()` for context
helpers or `toFileBody()` for REST so bytes are included. Both validate the
complete payload through the same path. Virello uploads named Blobs as
`files[0]`, `files[1]`, and so on. MessageBuilder assigns matching numeric
attachment IDs; caller-supplied IDs never shift multipart positions.

For an edit, include every retained attachment explicitly, for example
`new AttachmentBuilder({ id: existing.id })`, alongside new uploads. Retained
snowflake IDs stay unchanged; they consume no upload position. Omit the
attachments field in a native edit to leave attachments alone, or use
`{ attachments: [] }` to remove them. The message builder builds complete
nonempty payloads; it is not a general PATCH builder.

## Migrate existing builders

- Replace `@discordjs/builders` imports with `virello/builders`. Common Discord
  enums are exported there; use `DiscordAPI` from `virello/discord` for the
  complete API type/enum namespace and route helpers.
- Registration callbacks receive Virello builders. `ContextMenuCommandBuilder`
  is constructible and supports `setType`. The slash options-only and
  subcommands-only type names are retained. Passing native command JSON works
  as before; convert foreign command builders with their `toJSON()` first.
- Internal builder `.data` is private/protected. Use setters and `toJSON()` for
  complete payloads. `EmbedBuilder.toData()` copies an unfinished template;
  merge visible content and serialize the final embed before sending it.
- Empty or color-only embeds fail serialization. Pagination stores template
  snapshots and validates after page content is added. Validation stays enabled.
- This is not full discord.js builder API parity. Poll/allowed-mentions builder
  classes, global validation toggles, and Ovencord RawFile helpers are not part
  of this milestone. Use native objects for those endpoint fields.

No performance improvement is claimed. Upstream's test claims are not evidence
of coverage for this fork; Virello's checks and the PR record are authoritative.
