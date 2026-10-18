import { type LoggerLike, logEvent } from "virello/engine";
import { exampleLogger } from "./logging";

export function onShutdown(
	close: () => Promise<unknown>,
	options: { logger?: LoggerLike; component?: string } = {},
): () => void {
	const logger = options.logger ?? exampleLogger;
	const component = options.component ?? "process";
	let closing = false;
	const detach = () => {
		process.off("SIGINT", interrupt);
		process.off("SIGTERM", terminate);
	};
	const stop = (signal: string) => {
		if (closing) return;
		closing = true;
		detach();
		logEvent(logger, "notif", {
			component,
			event: "shutdown_started",
			message:
				"Shutdown requested; stopping owned processes and releasing resources.",
			context: { signal },
		});
		void close()
			.then(() => {
				logEvent(logger, "notif", {
					component,
					event: "shutdown_complete",
					message: "Shutdown complete; owned resources have been released.",
				});
			})
			.catch((error) => {
				logEvent(logger, "error", {
					component,
					event: "shutdown_failed",
					message:
						"Shutdown could not release every resource; inspect cleanup before restarting this process.",
					error,
				});
				process.exitCode = 1;
			});
	};
	const interrupt = () => stop("SIGINT");
	const terminate = () => stop("SIGTERM");
	process.once("SIGINT", interrupt);
	process.once("SIGTERM", terminate);
	return detach;
}
