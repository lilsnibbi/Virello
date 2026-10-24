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
