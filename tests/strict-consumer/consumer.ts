import {
	Client as DiscordClient,
	type Message as DiscordMessage,
} from "discord.js";
import {
	VirelloClient,
	Listener,
	Events,
	type Message,
	RadioGroupBuilder,
	CheckboxGroupBuilder,
	LabelBuilder,
	ClusterClient,
	CrossHostShard,
	getInfo,
} from "virello";

// A strict raw-TypeScript consumer uses actual discord.js types.
export const client: DiscordClient = new VirelloClient({ intents: [] });
export function messageIdentity(message: Message): DiscordMessage {
	return message;
}
export class OnMessage extends Listener<typeof Events.MessageCreate> {
	public override run(message: Message): void {
		void message.author.displayAvatarURL();
	}
}
export const radio = new LabelBuilder()
	.setLabel("Topic")
	.setRadioGroupComponent(
		new RadioGroupBuilder()
			.setCustomId("topic")
			.addOptions(
				{ label: "Account", value: "account" },
				{ label: "Billing", value: "billing" },
			),
	);
export const checkbox = new LabelBuilder()
	.setLabel("Details")
	.setCheckboxGroupComponent(
		new CheckboxGroupBuilder()
			.setCustomId("details")
			.setRequired(false)
			.setMinValues(0)
			.setMaxValues(2)
			.addOptions(
				{ label: "Account", value: "account" },
				{ label: "Billing", value: "billing" },
			),
	);
export function upload(client: VirelloClient, data: Uint8Array) {
	return client.rest.post("/guilds/1/stickers", {
		reason: "Add sticker",
		appendToFormData: true,
		body: { name: "Wave", description: "", tags: "wave" },
		files: [{ key: "file", name: "wave.png", data, contentType: "image/png" }],
	});
}
// Compile-only worker wiring; this fixture is never executed.
export function worker() {
	const info = getInfo();
	const client = new VirelloClient({
		intents: [],
		shards: info.SHARD_LIST,
		shardCount: info.TOTAL_SHARDS,
	});
	const cluster = new ClusterClient(client);
	client.cluster = cluster;
	client.crosshost = new CrossHostShard(cluster);
	client.once(Events.ClientReady, (ready) => {
		ready.modules.require("commands");
		ready.user.setPresence({ status: "online" });
		cluster.triggerReady();
	});
	return client;
}
