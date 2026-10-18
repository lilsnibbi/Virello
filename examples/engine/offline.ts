import { EngineClient, logEvent } from "virello/engine";
import { exampleLogger } from "../logging";
import { MockDiscord } from "./MockDiscord";

async function main(): Promise<void> {
	const server = new MockDiscord();
	const client = new EngineClient({
		token: "local-fixture-not-a-real-token",
		intents: 0,
		rest: { baseURL: server.baseURL },
		cache: { messagesPerChannel: 10 },
		onError: ({ source, error, fatal }) => {
			// This fixture deliberately requests one reconnect; other diagnostics remain visible.
			const expectedReconnect =
				source === "gateway" &&
				!fatal &&
				error.message === "Gateway requested reconnect.";
			logEvent(
				exampleLogger,
				expectedReconnect ? "debug" : fatal ? "error" : "alert",
				{
					component: "validation.engine",
					event: expectedReconnect ? "resume_check" : "engine_diagnostic",
					message: expectedReconnect
						? "Local gateway requested a reconnect; verifying session resume."
						: "Offline engine reported an unexpected failure; inspect the protocol diagnostic.",
					context: { source, fatal },
					error: expectedReconnect ? undefined : error,
				},
			);
		},
	});
	const replied = Promise.withResolvers<void>();
	const resumed = Promise.withResolvers<void>();
	client.on("messageCreate", async (message) => {
		await message.reply({
			content: "Pong from the original Virello engine.",
			allowed_mentions: { parse: [] },
		});
		replied.resolve();
	});
	client.on("resumed", () => resumed.resolve());
	const timeout = setTimeout(() => {
		replied.reject(new Error("Offline example timed out."));
		resumed.reject(new Error("Resume timed out."));
	}, 5000);
	// Attach both promises immediately so failure cleanup cannot cause an unhandled rejection.
	const finished = Promise.all([replied.promise, resumed.promise]);
	try {
		await client.connect();
		server.dispatch("MESSAGE_CREATE", MockDiscord.message());
		await replied.promise;
		server.reconnect();
		await finished;
		if (server.sentMessages.length !== 1 || server.connections !== 2)
			throw new Error("Unexpected offline protocol result.");
		logEvent(exampleLogger, "notif", {
			component: "validation.engine",
			event: "offline_passed",
			message:
				"Offline engine checks passed: gateway connected, message reply delivered and session resumed.",
			context: {
				replies: server.sentMessages.length,
				connections: server.connections,
			},
		});
	} finally {
		clearTimeout(timeout);
		client.close();
		await server.stop();
	}
}

await main().catch((error) => {
	logEvent(exampleLogger, "error", {
		component: "validation.engine",
		event: "offline_failed",
		message:
			"Offline engine validation failed; inspect the protocol result and error cause.",
		error,
	});
	process.exitCode = 1;
});
