import "./contracts";
import { VirelloClient } from "../../../packages/core/src/core/client/VirelloClient";
import { logger } from "../helpers";

// Native gateway and IPC, with all HTTP/WebSocket traffic confined to the test's loopback server.
const baseURL = process.env.SHARD_TEST_API!;
if (new URL(baseURL).hostname !== "127.0.0.1")
	throw new Error("The gateway fixture requires a loopback API.");
const client = new VirelloClient({
	intents: [],
	logger,
	rest: { baseURL },
	extensions: {
		localisation: false,
		scheduledtasks: false,
		patternCommands: false,
		subcommands: false,
		services: false,
	},
});
client.sharding.handle("probe", (data, context) => ({
	shard: client.sharding.id!,
	pid: process.pid,
	value: data.value,
	source: context.source,
}));
client.sharding.handle("loginState", () => client.isReady());
// This fixture owns no timers, jobs, database effects or application resources.
client.sharding.onRelease(async () => {});
await client.login("offline-test-placeholder");
