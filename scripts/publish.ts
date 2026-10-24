import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--dry-run"))
	throw new Error("Usage: bun release:publish [--dry-run]");
const dryRun = args.includes("--dry-run");
for (const command of [
	"check",
	"pack",
	"verify",
	...(dryRun ? [] : ["publish"]),
]) {
	const child = Bun.spawn([process.execPath, "scripts/release.ts", command], {
		cwd: root,
		stdout: "inherit",
		stderr: "inherit",
	});
	if ((await child.exited) !== 0) throw new Error(`Release ${command} failed.`);
}
console.log(
	dryRun ? "Verified one package; nothing published." : "Published virello.",
);
