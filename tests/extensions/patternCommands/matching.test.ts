import { afterEach, expect, test } from "bun:test";
import { dm, message as nativeMessage } from "../../fixtures/discord";
import { VirelloClient, PatternCommand, PatternCommandEvents } from "virello";
import type { MessageParseListener } from "../../../packages/core/src/extensions/patternCommands/listeners/messageParse";
import type { PatternCommandPrePayload } from "../../../packages/core/src/extensions/patternCommands/types";

let client: VirelloClient | undefined;
afterEach(async () => {
	await client?.destroy();
	client = undefined;
});

test("full-name patterns match words within a message but exclude substrings", async () => {
	client = new VirelloClient({
		intents: [],
		logger: { debug() {}, notif() {}, alert() {}, error() {} },
	});
	const owner = client;
	class Lore extends PatternCommand {
		constructor(context: PatternCommand.Context) {
			super(context, { matchFullName: true });
		}
		override messageRun() {}
	}
	await owner.modules.addModule({
		store: "patterns",
		name: "lore",
		module: Lore,
	});
	await owner.load();
	const parser = owner.modules
		.require("listeners")
		.get("PatternMessageParse") as MessageParseListener;
	const matches: string[] = [];
	owner.on(PatternCommandEvents.PreCommandRun, (payload) => {
		matches.push((payload as PatternCommandPrePayload).message.content);
	});
	const channel = dm(owner);
	for (const content of [
		"lore",
		"some lore here",
		"lore!",
		"explore",
		"folklore",
	]) {
		const message = nativeMessage(owner, {
			id: "123456789012345679",
			channel_id: channel.id,
			content,
			timestamp: new Date().toISOString(),
			author: {
				id: "123456789012345680",
				username: "tester",
				global_name: null,
				discriminator: "0",
				avatar: null,
			},
		});
		await parser.run(message);
	}
	expect(matches).toEqual(["lore", "some lore here", "lore!"]);
});
