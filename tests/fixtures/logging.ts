import { createConsoleLogger } from "../../src/core/logging/console";
import { writeEvent } from "../../src/core/logging/diagnostics";

// Synthetic subprocess fixture: no clients, services or network requests.
const logger = createConsoleLogger("fixture");
logger.debug("hidden routine detail");
writeEvent(logger, "notif", {
	component: "client",
	event: "ready",
	message: "Fixture ready.",
	context: {
		token: "fixture-private-token",
		endpoint: "https://user:password@example.test/path?token=fixture-query",
		note: process.env.VIRELLO_FIXTURE_TOKEN,
	},
});
writeEvent(logger, "alert", {
	component: "rest",
	event: "request_rejected",
	message: "Fixture request rejected.",
	context: { status: 403 },
});
writeEvent(logger, "error", {
	component: "tasks",
	event: "task_failed",
	message: "Fixture task failed.",
	error: Object.assign(new Error("fixture-private-error-body"), {
		code: "ECONNREFUSED",
	}),
});
