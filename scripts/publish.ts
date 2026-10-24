import { resolve } from "node:path";
import packages from "../release-packages.json";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--dry-run"))
	throw new Error("Usage: bun release:publish [--dry-run]");
const dryRun = args.includes("--dry-run");

async function run(args: string[], cwd: string): Promise<void> {
	const child = Bun.spawn([process.execPath, ...args], {
		cwd,
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await child.exited;
	if (code !== 0)
		throw new Error(
			`bun ${args.join(" ")} failed in ${cwd} (exit ${code}). Stopping; earlier packages may already be published.`,
		);
}

await run(["scripts/release.ts", "check"], root);
for (const path of packages) {
	console.log(`\n${dryRun ? "Checking" : "Publishing"} ${path}`);
	await run(
		["publish", "--access", "public", ...(dryRun ? ["--dry-run"] : [])],
		resolve(root, path),
	);
}
console.log(
	dryRun
		? `Dry run complete for ${packages.length} packages; nothing published.`
		: `Published all ${packages.length} packages.`,
);
