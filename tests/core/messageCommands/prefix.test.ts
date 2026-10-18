import { afterEach, expect, test } from "bun:test";
import { dm, message as nativeMessage } from "../../fixtures/discord";
import { Command, Events, VirelloClient } from "virello";
import { PrefixedMessageListener } from "../../../src/commands/message/listeners/prefixedMessage";
import { PreMessageParserListener } from "../../../src/commands/message/listeners/preMessageParser";

let client: VirelloClient | undefined;
afterEach(async () => {
	await client?.destroy();
	client = undefined;
});

for (const regexPrefix of [/^!/g, /^!/y]) {
	test(`stateful regex prefix ${regexPrefix.flags} dispatches consecutive messages without changing regex state`, async () => {
		client = new VirelloClient({
			intents: [],
			regexPrefix,
			logger: { debug() {}, notif() {}, alert() {}, error() {} },
		});
		class Ping extends Command {
			override messageRun() {}
		}
		await client.modules.addModule({
			store: "commands",
			name: "ping",
			module: Ping,
		});
		await client.load();
		const context = {
			name: "test-parser",
			root: "::virtual::",
			path: "::virtual::",
			store: client.modules.require("listeners"),
		};
		const preParser = new PreMessageParserListener(context);
		const parser = new PrefixedMessageListener(context);
		const parameters: string[] = [];
		client.on(Events.PrefixedMessage, (message, prefix) => {
			parser.run(message, prefix);
		});
		client.on(Events.PreMessageCommandRun, (payload) => {
			parameters.push(payload.parameters);
		});
		const channel = dm(client);
		for (const suffix of ["first", "second", "third"]) {
			const message = nativeMessage(client, {
				id: "123456789012345679",
				channel_id: channel.id,
				content: `!ping ${suffix}`,
				timestamp: new Date().toISOString(),
				author: {
					id: "123456789012345680",
					username: "tester",
					global_name: null,
					discriminator: "0",
					avatar: null,
				},
			});
			await preParser.run(message);
		}
		expect(parameters).toEqual(["first", "second", "third"]);
		expect(regexPrefix.lastIndex).toBe(0);
	});
}
