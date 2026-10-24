import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditExports } from "./exports";
import baseline from "./public-api.json";

async function auditFixture(
	names: string[],
	entrypoint = 'export * from "@virello/core";',
): Promise<string[]> {
	const root = mkdtempSync(join(tmpdir(), "virello-export-test-"));
	try {
		const core = join(root, "node_modules/@virello/core");
		mkdirSync(core, { recursive: true });
		writeFileSync(
			join(root, "package.json"),
			JSON.stringify({
				type: "module",
				types: "./index.ts",
				exports: { ".": { types: "./index.ts", bun: "./index.ts" } },
			}),
		);
		writeFileSync(join(root, "index.ts"), entrypoint);
		writeFileSync(
			join(core, "package.json"),
			JSON.stringify({
				name: "@virello/core",
				type: "module",
				exports: { ".": { types: "./index.ts", bun: "./index.ts" } },
			}),
		);
		writeFileSync(
			join(core, "index.ts"),
			`const value = 1;\n${names.map((name) => `export { value as ${name} };`).join("\n")}`,
		);
		const failures: string[] = [];
		await auditExports(root, failures);
		return failures;
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("export audit accepts the complete public contract", async () => {
	expect(await auditFixture(baseline.exports)).toEqual([]);
});

test("export audit reports missing and unexpected exports", async () => {
	const failures = await auditFixture([
		...baseline.exports.slice(1),
		"UnexpectedExport",
	]);
	expect(failures).toHaveLength(1);
	expect(failures[0]).toContain(`Missing: ${baseline.exports[0]}.`);
	expect(failures[0]).toContain("Added: UnexpectedExport.");
});

test("export audit rejects executable statements in the root barrel", async () => {
	const failures = await auditFixture(
		baseline.exports,
		'console.log("side effect"); export * from "@virello/core";',
	);
	expect(failures).toContain(
		"Root entrypoint must contain a single barrel export.",
	);
	expect(failures).toContain(
		"Public entrypoint must re-export @virello/core: .",
	);
});
