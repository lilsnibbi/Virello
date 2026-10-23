import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

test("SQLite recovery waits for all hosts, fences old children and reconstructs corrupt or rolled-back state", async () => {
	const folder = mkdtempSync(join(tmpdir(), "virello-recovery-test-"));
	if (!resolve(folder).startsWith(resolve(tmpdir()) + sep))
		throw new Error("Unsafe fixture directory.");
	const messages: unknown[] = [];
	const child = Bun.spawn(
		[
			process.execPath,
			fileURLToPath(new URL("./fixtures/sqliteRecovery.ts", import.meta.url)),
			folder,
		],
		{
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			windowsHide: true,
			ipc: (message) => messages.push(message),
		},
	);
	const output = new Response(child.stderr).text();
	const timer = setTimeout(() => child.kill(9), 55000);
	try {
		const code = await child.exited;
		expect({ code, output: await output }).toEqual({ code: 0, output: "" });
		expect(messages).toContainEqual({
			event: "passed",
			metadataReads: 4,
			restartCycles: 3,
		});
	} finally {
		clearTimeout(timer);
		child.kill(9);
		await child.exited;
		rmSync(folder, { recursive: true, force: true });
	}
}, 60000);
