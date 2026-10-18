// Only the example subprocess loads this preload. No Discord request leaves the fixture.
import { ShardManager } from "virello/sharding";

// Duplicate rejection is scoped to a supervisor instance, not every process sharing a host ID.
// Pin the example's test identity before it opens a socket, just like the coordinator protocol tests.
const instance = process.env.VIRELLO_TEST_SUPERVISOR_INSTANCE;
if (instance) {
	const start = ShardManager.prototype.start;
	ShardManager.prototype.start = function () {
		Reflect.set(this, "instance", instance);
		return start.call(this);
	};
}

const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
	async (...args: Parameters<typeof fetch>): Promise<Response> => {
		const input = args[0];
		if (new URL(String(input)).hostname === "127.0.0.1")
			return originalFetch(...args);
		if (String(input) !== "https://discord.com/api/v10/gateway/bot")
			throw new Error("Unexpected fixture HTTP request.");
		return Response.json({
			session_start_limit: {
				total: 10,
				remaining: 10,
				reset_after: 60000,
				max_concurrency: 1,
			},
		});
	},
	originalFetch,
);

// Controlled shutdown lets the actual example drain naturally on Windows too,
// where Subprocess.kill('SIGTERM') terminates the process instead of delivering a JS signal.
if (process.env.VIRELLO_TEST_CONTROL_SHUTDOWN === "1" && process.send) {
	process.on("message", (message) => {
		if ((message as { fixture?: string }).fixture !== "shutdown") return;
		process.emit("SIGTERM", "SIGTERM");
		process.disconnect?.();
	});
}
