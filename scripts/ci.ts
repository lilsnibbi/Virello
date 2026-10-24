import { existsSync } from "node:fs";
import { join } from "node:path";
import { auditExports } from "./exports";

const root = join(import.meta.dir, "..");
async function run(...args: string[]): Promise<void> {
	const label =
		args.length > 3
			? `${args[0]} ${args[1]} (${args.length - 2} files)`
			: args.join(" ");
	console.log(`::group::bun ${label}`);
	const child = Bun.spawn([process.execPath, ...args], {
		cwd: root,
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await child.exited;
	console.log("::endgroup::");
	if (code !== 0) throw new Error(`bun ${label} failed with exit code ${code}`);
}

await run("check");
await run("lint");
const failures: string[] = [];
auditExports(root, failures);
if (failures.length) throw new Error(failures.join("\n"));
const trackedFiles = Bun.spawnSync(
	["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
	{ cwd: root },
);
if (trackedFiles.exitCode !== 0)
	throw new Error("Could not list repository files for formatting.");
// Release Please regenerates these outputs using its own formatting.
const formatFiles = [
	...new Set(trackedFiles.stdout.toString().split("\0")),
].filter(
	(file) =>
		/\.(?:css|html|[cm]?[jt]sx?|json[5c]?|mdx?|toml|ya?ml)$/.test(file) &&
		file !== "CHANGELOG.md" &&
		file !== ".release-please-manifest.json" &&
		existsSync(join(root, file)),
);
// Keep command lines below Windows process argument limits.
for (let offset = 0; offset < formatFiles.length; offset += 100)
	await run("fmt", "--check", ...formatFiles.slice(offset, offset + 100));
console.log("Validation passed: types, lint, public exports and formatting.");
