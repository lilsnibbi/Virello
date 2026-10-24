import { createHash } from "node:crypto";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const registry = "https://registry.npmjs.org";
const repository = "https://github.com/lilsnibbi/Virello.git";
const groups = [
	"dependencies",
	"optionalDependencies",
	"peerDependencies",
	"devDependencies",
] as const;
type Manifest = {
	name: string;
	version: string;
	private?: boolean;
	repository: { url: string };
	publishConfig: { access: string; registry: string };
	exports: Record<string, { types: string; bun: string }>;
	types: string;
	files: string[];
} & Partial<Record<(typeof groups)[number], Record<string, string>>>;
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
// Manifest paths and tar entries use forward slashes on every platform.
const packagePath = (file: string) => file.replaceAll("\\", "/");
const scanFiles = (pattern: string, cwd: string, dot = false) =>
	Array.from(
		new Bun.Glob(pattern).scanSync({ cwd, dot, onlyFiles: true }),
		packagePath,
	);
// There is exactly one publishable package.
const paths = ["."];
const packages = paths.map((path) => ({
	path,
	directory: resolve(root, path),
	manifest: json(join(root, path, "package.json")) as Manifest,
}));
const main = packages.find((pkg) => pkg.path === ".");
if (!main) throw new Error("The release plan must include the root package.");
const version = main.manifest.version;
const [command, output = ".release"] = process.argv.slice(2);
if (!["check", "pack", "verify", "publish"].includes(command ?? ""))
	throw new Error(
		"Usage: bun scripts/release.ts check|pack|verify|publish [directory]",
	);

function run(args: string[], cwd = root): string {
	const result = Bun.spawnSync(args, { cwd, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0)
		throw new Error(`${args[0]} failed: ${result.stderr.toString()}`);
	return result.stdout.toString().trim();
}

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
if (!stableVersion.test(version))
	throw new Error(
		"This release flow currently supports stable x.y.z versions only.",
	);
if (json(join(root, ".release-please-manifest.json"))["."] !== version)
	throw new Error("Release Please manifest and root version differ.");
const lockText = readFileSync(join(root, "bun.lock"), "utf8");
const lock = Bun.JSONC.parse(lockText) as {
	workspaces: Record<string, { name?: string }>;
};
if (
	"workspaces" in main.manifest ||
	Object.keys(lock.workspaces).join() !== "" ||
	lock.workspaces[""]?.name !== "virello"
)
	throw new Error("Only the root virello package may be a workspace.");
const names = new Map(packages.map((pkg) => [pkg.manifest.name, pkg]));
if (names.size !== packages.length || new Set(paths).size !== paths.length)
	throw new Error("Duplicate release package.");
const publicPaths = [
	".",
	...scanFiles("packages/*/package.json", root)
		.filter((file) => !json(join(root, file)).private)
		.map((file) => file.slice(0, -"/package.json".length)),
];
if (JSON.stringify([...paths].sort()) !== JSON.stringify(publicPaths.sort()))
	throw new Error(
		"Remove scoped workspace manifests; only virello is published.",
	);
const seen = new Set<string>();
for (const pkg of packages) {
	const manifest = pkg.manifest;
	if (
		manifest.private ||
		manifest.name !== "virello" ||
		manifest.version !== version ||
		manifest.repository.url !== repository ||
		manifest.publishConfig?.access !== "public" ||
		manifest.publishConfig.registry !== registry
	)
		throw new Error(`Invalid public package metadata: ${pkg.path}`);
	for (const file of [
		"package.json",
		...manifest.files,
		manifest.types,
		...Object.values(manifest.exports).flatMap((entry) => [
			entry.types,
			entry.bun,
		]),
	]) {
		if (!existsSync(resolve(pkg.directory, file)))
			throw new Error(`Missing publish input in ${pkg.path}: ${file}`);
	}
	for (const group of groups) {
		for (const [name, spec] of Object.entries(manifest[group] ?? {})) {
			if (
				/^(workspace:|file:|link:)/.test(spec) ||
				name.startsWith("@virello/")
			)
				throw new Error(`Unpublished local dependency: ${name}`);
		}
	}
	seen.add(manifest.name);
}
console.log(`Single public package: virello@${version}`);

if (command === "pack" || command === "verify" || command === "publish") {
	const expected = json(
		join(root, "scripts/release-tools/package.json"),
	).bunRevision;
	if (run([process.execPath, "--revision"]) !== expected)
		throw new Error(
			"Use the locked Bun installed by npm ci --prefix scripts/release-tools.",
		);
}

if (command === "pack") {
	const destination = resolve(root, output);
	mkdirSync(destination, { recursive: true });
	const staging = mkdtempSync(join(tmpdir(), "virello-release-"));
	try {
		// A clean staging tree prevents laptop/runner umasks from changing tarball
		// integrity. These raw TypeScript packages have no executable bin entries.
		for (const pkg of packages) {
			const directory = join(staging, pkg.path);
			mkdirSync(directory, { recursive: true });
			for (const file of ["package.json", ...pkg.manifest.files])
				cpSync(join(pkg.directory, file), join(directory, file), {
					recursive: true,
				});
		}
		for (const file of ["bun.lock", ".gitignore"])
			if (existsSync(join(root, file)))
				cpSync(join(root, file), join(staging, file));
		for (const file of scanFiles("**/*", staging, true))
			chmodSync(join(staging, file), 0o644);
		for (const pkg of packages) {
			const tarball = join(
				destination,
				`${pkg.manifest.name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`,
			);
			run(
				[
					process.execPath,
					"pm",
					"pack",
					"--ignore-scripts",
					"--quiet",
					"--filename",
					tarball,
				],
				join(staging, pkg.path),
			);
			const entries = new Set(
				run(["tar", "-tzf", tarball]).split(/\r?\n/).map(packagePath),
			);
			const packed = JSON.parse(
				run(["tar", "-xOf", tarball, "package/package.json"]),
			) as Manifest;
			const required = [
				"package.json",
				"README.md",
				packed.types,
				...Object.values(packed.exports).flatMap((entry) => [
					entry.types,
					entry.bun,
				]),
				...scanFiles("src/**", pkg.directory),
				...scanFiles("docs/**", pkg.directory),
				...pkg.manifest.files.filter(
					(file) => file !== "src" && file !== "docs",
				),
			];
			for (const file of required) {
				if (!entries.has(`package/${packagePath(file).replace(/^\.\//, "")}`))
					throw new Error(`Missing packed file in ${pkg.path}: ${file}`);
			}
			for (const entry of entries) {
				if (
					/(^|\/)(node_modules|tests|\.github|\.agents)(\/|$)/.test(entry) ||
					(/(^|\/)\.env($|\.)/.test(entry) && !entry.endsWith("/.env.example"))
				)
					throw new Error(`Unexpected packed file: ${entry}`);
			}
			for (const group of groups) {
				for (const [name, spec] of Object.entries(packed[group] ?? {})) {
					if (
						/^(workspace:|file:|link:)/.test(spec) ||
						(names.has(name) && spec !== version)
					)
						throw new Error(`Invalid packed dependency: ${name}@${spec}`);
				}
			}
			console.log(`Verified ${tarball} (${entries.size} entries)`);
		}
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
}

if (command === "verify") {
	const consumer = mkdtempSync(join(tmpdir(), "virello-consumer-"));
	try {
		const tarball = resolve(root, output, `virello-${version}.tgz`);
		if (!existsSync(tarball))
			throw new Error("Pack virello before verifying it.");
		writeFileSync(
			join(consumer, "package.json"),
			JSON.stringify({
				private: true,
				type: "module",
				dependencies: {
					virello: `file:${packagePath(tarball)}`,
					"discord.js": main.manifest.devDependencies!["discord.js"],
				},
			}),
		);
		run(
			[
				process.execPath,
				"install",
				"--ignore-scripts",
				`--registry=${registry}`,
			],
			consumer,
		);
		if (existsSync(join(consumer, "node_modules/@virello")))
			throw new Error("Isolated virello installed a removed scoped package.");
		cpSync(join(root, "scripts/imports.ts"), join(consumer, "imports.ts"));
		for (const path of Object.keys(main.manifest.exports)) {
			const spec = "virello" + (path === "." ? "" : path.slice(1));
			run([process.execPath, "imports.ts", spec], consumer);
		}
		console.log(
			"Verified isolated virello imports and upstream class identity.",
		);
	} finally {
		rmSync(consumer, { recursive: true, force: true });
	}
}

if (command === "publish") {
	// Live publication is deliberately separate from check/pack and laptop bootstrap.
	if (
		!process.env.ACTIONS_ID_TOKEN_REQUEST_URL ||
		!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
	)
		throw new Error("Automated publishing requires GitHub Actions OIDC.");
	if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN)
		throw new Error("Do not supply npm tokens to the trusted-publishing job.");
	const npmVersion = run(["npm", "--version"]);
	const [major, minor, patch] = npmVersion.split(".").map(Number);
	if (
		!Number.isInteger(major) ||
		major! < 11 ||
		(major === 11 && (minor! < 5 || (minor === 5 && patch! < 1)))
	)
		throw new Error(`npm >=11.5.1 is required for OIDC; found ${npmVersion}.`);
	const pending: { spec: string; tarball: string }[] = [];
	for (const pkg of packages) {
		const tarball = resolve(
			root,
			output,
			`${pkg.manifest.name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`,
		);
		const integrity = `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`;
		const spec = `${pkg.manifest.name}@${version}`;
		const result = Bun.spawnSync(
			[
				"npm",
				"view",
				spec,
				"dist.integrity",
				"--json",
				`--registry=${registry}`,
			],
			{ cwd: root, stdout: "pipe", stderr: "pipe" },
		);
		if (result.exitCode === 0) {
			if (JSON.parse(result.stdout.toString()) !== integrity)
				throw new Error(
					`Published ${spec} differs from this tarball; do not overwrite or skip it.`,
				);
			console.log(`Already published, integrity verified: ${spec}`);
			continue;
		}
		let code: string | undefined;
		try {
			code = JSON.parse(result.stdout.toString()).error?.code;
		} catch {
			// Non-JSON errors remain failures; only a parsed E404 permits publishing.
		}
		if (code !== "E404")
			throw new Error(
				`Registry lookup failed for ${spec}: ${result.stderr.toString()}`,
			);
		pending.push({ spec, tarball });
	}
	// Publish only the verified root tarball.
	for (const { spec, tarball } of pending) {
		console.log(`Publishing ${spec}`);
		console.log(
			run([
				"npm",
				"publish",
				tarball,
				"--access",
				"public",
				"--tag",
				"latest",
				"--ignore-scripts",
				`--registry=${registry}`,
			]),
		);
	}
}
