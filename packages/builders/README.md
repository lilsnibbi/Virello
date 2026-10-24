# @virello/builders

Virello-owned command, embed, Components V2, modal and attachment builders for Bun.
This package does not create a client or open network connections.

```ts
import { EmbedBuilder } from "@virello/builders";

const embed = new EmbedBuilder().setDescription("Ready.");
console.log(embed.toJSON());
```

Install `virello` for the framework and use the same builders through
`virello`. Install `@virello/builders` directly when payload construction
is all you need. Both entrypoints expose the same builder implementation.

Serialization validates completed payloads, including nested components.
`EmbedBuilder.toData()` snapshots an unfinished template; `toJSON()` validates
its final content. File uploads use named Blobs. No global validation bypass is
provided.

## Radio and checkbox groups in modals

`RadioGroupBuilder` and `CheckboxGroupBuilder` create modal controls inside labels.
Options accept native data, option builders, or callbacks, with `setLabel()`,
`setValue()`, `setDescription()` and `setDefault()` on each option builder.

```ts
import { LabelBuilder, ModalBuilder } from "@virello/builders";

const modal = new ModalBuilder()
	.setCustomId("support")
	.setTitle("Contact support")
	.addLabelComponents(
		new LabelBuilder()
			.setLabel("Topic")
			.setRadioGroupComponent((group) =>
				group
					.setCustomId("topic")
					.setRequired()
					.addOptions(
						{ label: "Account", value: "account", default: true },
						{ label: "Other", value: "other" },
					),
			),
		new LabelBuilder()
			.setLabel("Details")
			.setCheckboxGroupComponent((group) =>
				group
					.setCustomId("details")
					.setRequired(false)
					.setMinValues(0)
					.setMaxValues(2)
					.addOptions(
						{ label: "Billing", value: "billing" },
						{ label: "Login", value: "login" },
					),
			),
	);
```

Serialization checks option lengths and unique values, radio groups' 2–10 options
and single default, and checkbox groups' 1–10 options, selection bounds and
requiredness. Defaults cannot exceed the checkbox selection maximum. Omitted
`required` means true; a checkbox minimum of zero requires `setRequired(false)`.

On a framework modal submission, read
`interaction.fields.getRadioGroupValue("topic")` (`string | null`) and
`interaction.fields.getCheckboxGroupValues("details")` (`string[]`). Null and an
empty array preserve optional empty selections. Missing fields and mismatched
component types throw. These builders and option builders are also exported from
`virello`.
