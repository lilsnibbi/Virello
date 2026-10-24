# Localisation

[Docs](README.md) / Localisation · [Options](../packages/core/src/extensions/localisation/types.ts)

## Translate a reply

Create these files beneath your client's `root`:

**`languages/en-US/bot.json`**

```json
{
	"hello": "Hello, {{name}}!",
	"greet": { "name": "greet", "description": "Say hello" }
}
```

**`languages/de/bot.json`**

```json
{
	"hello": "Hallo, {{name}}!",
	"greet": { "name": "gruss", "description": "Sag Hallo" }
}
```

In a slash command handler, after importing `resolveKey`:

```ts
import { resolveKey } from "virello/localisation";

// Inside chatInputRun(interaction):
const content = await resolveKey(interaction, "bot:hello", {
	name: interaction.user.username,
});
await interaction.reply({ content, allowed_mentions: { parse: [] } });
```

`bot` is the namespace (file name), `hello` the key. The default directory
is `languages`; resources load once before Discord login.

## Translate command labels

Inside `registerApplicationCommands(registry)`:

```ts
registry.registerChatInputCommand(
	(builder) => builder.setName("greet").setDescription("Say hello"),
	{ localisation: "bot:greet" },
);
```

The string expands into `.name` and `.description` translation keys.
The base name `greet` remains the routing key; translated labels are presentation.
For options/subcommands, map by their **base names**. Choice translations match
the original choice value and type, not a position or translated label.

For strict command translations, use
`extensions.localisation: { discord: { strict: true } }`.
By default, missing/invalid presentation fields warn and are skipped instead.

## How language is selected

```text
custom fetchLanguage(context)
  → interaction locale
  → guild preferred locale
  → defaultName (en-US)
```

The first non-null selection wins. If that language is not loaded, it falls back
to `defaultName` (or `en-US`), rather than walking the remaining choices.
You can also pass `lng` to `resolveKey` to choose explicitly.

| Setting under `extensions.localisation` | Default                                                      |
| --------------------------------------- | ------------------------------------------------------------ |
| `defaultName`                           | `en-US`                                                      |
| `defaultNS`                             | `default`                                                    |
| `defaultLanguageDirectory`              | `languages`, relative to client root                         |
| `resourceDirectories`                   | `[]`; extra roots in order                                   |
| `defaultMissingKey`                     | Unset; missing response keys fall back to an empty string    |
| `discord.locales`                       | Supported loaded Discord locales                             |
| `discord.defaultLocale`                 | `defaultName` or `en-US`; must be a supported Discord locale |
| `discord.strict`                        | `false`                                                      |

For response text that must never be empty, supply a fallback:
`resolveKey(interaction, "bot:missing", "Try again later.")`.
`fetchT(target)` returns a bound i18next translation function; `fetchLanguage`
returns the selected language. `getLocalizedData`, `applyNameLocalizedBuilder`
and related helpers apply presentation maps outside the registry.
[Exported helpers →](../packages/core/src/extensions/localisation/functions.ts)

## Loading rules worth knowing

- The default missing `languages` directory is optional. Explicit directories
  are diagnosed when missing; invalid JSON resources are reported and skipped.
- The first valid file namespace wins across roots. Inline
  `i18next.resources` replaces matching file namespaces.
- `i18next` accepts options or a synchronous `(namespaces, languages) => options`
  function. Backend loading, resource writes and translation HMR are unsupported.
- `onDiagnostic` replaces default diagnostic logging; thrown callback errors
  propagate. Inspect `container.i18n.diagnostics` for recorded issues.
- Restart after changing JSON. Disabling `localisation` removes these services;
  do not call its helpers or request registration localisation afterward.

[Loader implementation →](../packages/core/src/extensions/localisation/resources.ts)
