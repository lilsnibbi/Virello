import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

interface Manifest {
	name: string;
	version: string;
	files: string[];
	dependencies: Record<string, string>;
	workspaces?: string[];
}
const root = resolve(import.meta.dir, "..");
/** Produce local release artifacts without mutating manifests, installing or publishing anything. */
export async function packPackages(output: string): Promise<string[]> {
	const umbrella: Manifest = JSON.parse(
		readFileSync(join(root, "package.json"), "utf8"),
	);
	const builders: Manifest = JSON.parse(
		readFileSync(join(root, "packages/builders/package.json"), "utf8"),
	);
	const target = resolve(output);
	mkdirSync(target, { recursive: true });
	const staging = mkdtempSync(join(tmpdir(), "virello-pack-"));
	if (!resolve(staging).startsWith(resolve(tmpdir()) + sep))
		throw new Error("Unsafe staging directory.");
	try {
		const artifacts: string[] = [];
		// The umbrella version is canonical; workspace dependencies become exact artifact versions.
		for (const [source, manifest] of [
			[join(root, "packages/builders"), builders],
			[root, umbrella],
		] as const) {
			const name = manifest.name.replace(/^@/, "").replaceAll("/", "-");
			const folder = join(staging, name);
			mkdirSync(folder);
			for (const file of manifest.files) {
				const path = resolve(source, file);
				if (!path.startsWith(source + sep))
					throw new Error(
						"Package files must stay inside their source directory.",
					);
				cpSync(path, join(folder, file), { recursive: true });
			}
			const packaged = {
				...manifest,
				version: umbrella.version,
				dependencies: { ...manifest.dependencies },
			};
			delete packaged.workspaces;
			if (manifest.name === "virello")
				packaged.dependencies[builders.name] = umbrella.version;
			writeFileSync(
				join(folder, "package.json"),
				JSON.stringify(packaged, null, "\t") + "\n",
			);
			const archive = join(target, `${name}-${umbrella.version}.tgz`);
			const child = Bun.spawn(
				[
					process.execPath,
					"pm",
					"pack",
					"--ignore-scripts",
					"--filename",
					archive,
				],
				{
					cwd: folder,
					stdout: "pipe",
					stderr: "pipe",
					windowsHide: true,
				},
			);
			const [stdout, stderr, code] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			if (code !== 0)
				throw new Error(`Could not package ${name}: ${stdout}\n${stderr}`);
			artifacts.push(archive);
		}
		return artifacts;
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
}
if (import.meta.main) {
	if (!Bun.argv[2])
		throw new Error("Usage: bun scripts/package.ts <output-directory>");
	for (const path of await packPackages(Bun.argv[2])) console.log(path);
}
