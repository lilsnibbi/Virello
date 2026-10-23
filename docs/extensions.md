# Services and extensions

[Docs](README.md) / Services and extensions

## Share a resource

A service is a named module with `onLoad`/`onUnload`. For example,
**`services/counters.ts`**:

```ts
import { Service } from "virello/services";

export default class Counters extends Service {
	private readonly counts = new Map<string, number>();

	increment(key: string): number {
		const next = (this.counts.get(key) ?? 0) + 1;
		this.counts.set(key, next);
		return next;
	}

	override onUnload(): void {
		this.counts.clear();
	}
}
```

Load it with `modules.services: "services/**/*.ts"`; `extensions.services`
must be enabled (the default). From a command in `commands/`:

```ts
import Counters from "../services/counters";
import { container } from "virello/client";

const counters = container.services.get("counters");
if (!(counters instanceof Counters)) throw new Error("Counters did not load.");
console.log(counters.increment("commands"));
```

Run that lookup inside your handler, after module loading. `get()` can return
`undefined`; it does not construct a missing service or infer your subclass.
The same service instance is shared within a process. Each shard has its own
memory, so use external storage or [messaging](shard-messaging.md) when data must
be shared across shards.

For a connection-backed service, acquire it in `onLoad()` and release it in
`onUnload()`. Cleanup must tolerate partially completed initialization.
[Service API →](../packages/core/src/extensions/services/Service.ts)

## Add a client feature

Extensions are classes with **static** hooks; Virello does not construct them.
This complete offline example owns a timer and cleans it up:

```ts
import { VirelloClient } from "virello/client";
import { Extension } from "virello/extensions";

class PulseExtension extends Extension {
	static override setup(client: VirelloClient): void {
		const timer = setInterval(() => {
			client.logger.debug("Process is alive.");
		}, 60_000);
		client.addDisposer(() => clearInterval(timer));
	}
}

const client = new VirelloClient({
	intents: [],
	extensions: { custom: [PulseExtension] },
});
await client.load();
await client.destroy();
```

| Hook                         | When it runs                                       | Use                                         |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------- |
| `static setup(client)`       | During construction; synchronous                   | Register stores/modules, attach resources   |
| `static beforeLogin(client)` | After modules and managed sharding, before Discord | Async initialization needing loaded modules |
| `static afterLogin(client)`  | After Discord login resolves                       | Start producers or background work          |

Built-ins run first, in this order: localisation, scheduled tasks, patterns,
subcommands, services. Custom classes follow your array order; duplicate class
references run once. Configure built-ins through their
[named options](client.md), not `custom`.

> [!NOTE]
> A custom extension is optional by default: a failed hook disables it and rolls
> back tracked resources. Set `static override readonly critical = true` when
> your bot cannot start without it. Scheduled tasks are a critical built-in.

Register cleanup with `client.addDisposer()` inside the hook that acquires the
resource. Cleanup runs in reverse order and is awaited. An extension's login
hooks run once per client; managed gateway reassignment does not repeat them.

[Extension contract →](../packages/core/src/core/lifecycle/Extension.ts) ·
[Startup order →](modules.md#startup-and-shutdown)
