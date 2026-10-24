import { expect, test } from "bun:test";
import { captureConsoleSession } from "./fixtures/consoleSession";
import { tokenA } from "./helpers";

for (const width of [64, 100]) {
	test(`actual coordinator and host output is readable at ${width} columns and shows same-instance rejection and readmission`, async () => {
		const session = await captureConsoleSession(width);
		expect(session.activeExit).toBe(0);
		expect(session.recovered).toBe(true);
		expect(session.coordinatorExit).toBe(0);
		expect(session.coordinator.replaceAll(/\s/g, "")).toContain(
			"host_already_connected",
		);
		expect(session.coordinator).not.toContain("ownership_reserved");
		expect(session.coordinator.replaceAll(/\s+/g, " ")).toContain(
			"active connection",
		);
		expect(session.host).toContain("connection_waiting");
		expect(session.host.replaceAll(/\s/g, "")).toContain(
			"host_already_connected",
		);
		expect(session.host.match(/^\[[^\n]+\]\s+ALERT\b/gm)).toHaveLength(1);
		expect(session.host).not.toContain("ERROR");
		for (const text of [session.coordinator, session.host]) {
			expect(
				text.split("\n").every((line) => Bun.stringWidth(line) <= width),
			).toBe(true);
			expect(text).not.toContain(tokenA);
			expect(text).not.toContain("fixture-discord-secret-never-use");
			expect(text).not.toContain("error={");
			expect(text).not.toContain("\x1b");
		}
	}, 20000);
}
