import { logEvent } from "virello/client";
import { Events, Listener } from "virello/events";

export default class ReadyListener extends Listener<typeof Events.ClientReady> {
	static override options: Listener.Options = {
		event: Events.ClientReady,
		once: true,
	};

	override run(): void {
		const client = this.container.client;
		// The framework emits the info readiness milestone after its registration pass.
		logEvent(this.container.logger, "debug", {
			component: "bot",
			event: "cache_ready",
			message: "Shard gateway cache is available to example handlers.",
			context: { shard: client.sharding.id, guilds: client.cache.guilds.size },
		});
	}
}
