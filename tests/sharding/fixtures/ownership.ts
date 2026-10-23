import { holdChildOwnership } from "../../../src/sharding/recovery/ownership";

const config = JSON.parse(Bun.argv[2]!);
function acquire() {
	try {
		holdChildOwnership(config);
		process.send?.({ event: "held" });
		if (Bun.argv[3] === "paused")
			setTimeout(() => {
				for (;;) {
					/* Simulate a child whose JS watchdog cannot run. */
				}
			}, 100);
	} catch (error) {
		process.send?.({
			event: "rejected",
			message: error instanceof Error ? error.message : String(error),
		});
		process.exitCode = 1;
		process.disconnect?.();
		clearInterval(keepAlive);
	}
}
const keepAlive = setInterval(() => {}, 1000);
process.on("message", (message) => {
	if (message === "acquire") acquire();
	if (message === "exit") process.exit(0);
});
process.on("disconnect", () => {
	if (Bun.argv[3] !== "orphan") process.exit(0);
});
if (Bun.argv[3] === "late") process.send?.({ event: "waiting" });
else acquire();
