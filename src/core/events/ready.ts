import { handleRegistryAPICalls } from "../commands/registration/registries";
import { writeEvent } from "../../logging/diagnostics";
import { Events } from "./events";
import { Listener } from "./listener";

export class ReadyListener extends Listener {
	public constructor(context: Listener.Context) {
		super(context, { event: Events.ClientReady, once: true });
	}

	public async run() {
		this.container.client.id ??= this.container.client.user?.id ?? null;

		await handleRegistryAPICalls();
		writeEvent(this.container.logger, "notif", {
			component: "client",
			event: "ready",
			message: "Discord connected; this client can now handle events.",
			context: {
				cluster: this.container.client.cluster?.id,
				commands: this.container.modules.require("commands").size,
				guilds: this.container.client.guilds.cache.size,
				shards: this.container.client.ws.shards.size,
			},
		});
	}
}
