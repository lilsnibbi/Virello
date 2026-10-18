import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RedisClient } from "bun";
import {
	assertCanaryToolchain,
	assertCompleteTests,
	requiredRedisUrl,
} from "./ciSupport";

const root = join(import.meta.dir, "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const revision = Bun.spawnSync([process.execPath, "--revision"]);
if (revision.exitCode !== 0)
	throw new Error("Could not read the Bun revision.");
assertCanaryToolchain(
	manifest.packageManager,
	revision.stdout.toString().trim(),
);
const redis = new RedisClient(
	requiredRedisUrl(process.env.VIRELLO_TEST_REDIS_URL),
	{ connectionTimeout: 5000, autoReconnect: false },
);
try {
	await redis.connect();
	if ((await redis.send("PING", [])) !== "PONG")
		throw new Error("Redis readiness failed.");
	console.log("Disposable Redis ready; complete integration coverage enabled.");
} finally {
	redis.close();
}
const reportDirectory = mkdtempSync(join(tmpdir(), "virello-ci-"));
async function run(...args: string[]): Promise<void> {
	console.log(`::group::bun ${args.join(" ")}`);
	const child = Bun.spawn([process.execPath, ...args], {
		cwd: root,
		stdout: "inherit",
		stderr: "inherit",
	});
	const code = await child.exited;
	console.log("::endgroup::");
	if (code !== 0)
		throw new Error(`bun ${args.join(" ")} failed with exit code ${code}`);
}
try {
	const report = join(reportDirectory, "tests.xml");
	// Keep sequential: tests create and remove temporary TypeScript discovery fixtures.
	await run("test", "--reporter=junit", `--reporter-outfile=${report}`);
	assertCompleteTests(readFileSync(report, "utf8"));
	await run("check");
	await run("lint");
	const trackedFiles = Bun.spawnSync(["git", "ls-files", "-z"]);
	if (trackedFiles.exitCode !== 0)
		throw new Error("Could not list tracked files for formatting.");
	// Release Please regenerates these outputs using its own formatting.
	const formatterExtensions = new Set([
		".css",
		".html",
		".js",
		".jsx",
		".json",
		".json5",
		".jsonc",
		".md",
		".mdx",
		".mjs",
		".cjs",
		".mts",
		".cts",
		".toml",
		".ts",
		".tsx",
		".yaml",
		".yml",
	]);
	const formatFiles = trackedFiles.stdout
		.toString()
		.split("\0")
		.filter((file) => {
			const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
			return (
				formatterExtensions.has(extension) &&
				file !== "CHANGELOG.md" &&
				file !== ".release-please-manifest.json"
			);
		});
	await run("fmt", "--check", ...formatFiles);
	await run("examples/offline.ts");
	await run("examples/engine/offline.ts");
	console.log(
		"Complete validation passed: no skipped tests, types, lint, formatting and both offline examples.",
	);
} finally {
	rmSync(reportDirectory, { recursive: true, force: true });
}
