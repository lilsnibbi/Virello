import "./contracts";
import { VirelloClient, type } from "virello";
import type { ShardClientStatus } from "virello/sharding";

// Exercise real IPC and leases. No Discord connection or token is used.
const client = new VirelloClient({
	intents: [],
	logger: { debug() {}, notif() {}, alert() {}, error() {} },
});
let ready = process.env.SHARD_TEST_READY !== "false";
Reflect.set(client, "isReady", () => ready);
Reflect.set(client, "startupComplete", true);
const transitions: ShardClientStatus[] = [];
client.sharding.onLifecycle(({ status }) => {
	transitions.push(status);
});
client.sharding.handle(
	"probe",
	(data, context) => ({
		shard: client.sharding.id!,
		pid: process.pid,
		value: data.value,
		source: context.source,
	}),
	type({ value: "number" }).assert,
);
client.sharding.handle("guildRelay", ({ guildId, value }) =>
	client.sharding.requestGuild(guildId, "probe", { value }),
);
client.sharding.handle("operationReady", (value) => {
	ready = value;
	return null;
});
client.sharding.handle("operationInfo", () => ({
	status: client.sharding.status,
	transitions,
}));
await client.sharding.connect();
