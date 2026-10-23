import { expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { packPackages } from "../../scripts/package";
import manifest from "../../package.json";
import buildersManifest from "../../packages/builders/package.json";

// Use the checkout's already-installed external dependencies without registry metadata or network access.
async function installedDependencies(
	artifacts: string,
): Promise<Record<string, string>> {
	const result: Record<string, string> = {};
	function visit(name: string, from: string): void {
		if (name.startsWith("@virello/") || result[name]) return;
		let entry: string;
		try {
			entry = Bun.resolveSync(`${name}/package.json`, from);
		} catch {
			entry = Bun.resolveSync(name, from);
		}
		let folder = dirname(entry);
		while (dirname(folder) !== folder) {
			const path = join(folder, "package.json");
			if (existsSync(path)) {
				const value = JSON.parse(readFileSync(path, "utf8"));
				if (value.name === name) {
					result[name] = `file:${folder}`;
					for (const dependency of Object.keys(value.dependencies ?? {}))
						visit(dependency, folder);
					return;
				}
			}
			folder = dirname(folder);
		}
		throw new Error(`Missing installed dependency manifest: ${name}`);
	}
	for (const name of Object.keys(manifest.dependencies))
		visit(name, resolve(import.meta.dir, "../.."));
	for (const name of Object.keys(buildersManifest.dependencies))
		visit(name, resolve(import.meta.dir, "../../packages/builders"));
	let index = 0;
	for (const [name, path] of Object.entries(result)) {
		const archive = join(artifacts, `dependency-${index++}.tgz`);
		await run(path.slice("file:".length), [
			"pm",
			"pack",
			"--ignore-scripts",
			"--filename",
			archive,
		]);
		result[name] = archive;
	}
	return result;
}

async function run(cwd: string, args: string[]) {
	const child = Bun.spawn([process.execPath, ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		windowsHide: true,
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (code !== 0)
		throw new Error(
			`Consumer check failed: ${args.join(" ")}\n${stdout}\n${stderr}`,
		);
	return stdout;
}
test("local artifacts install builders independently and through the single-install umbrella", async () => {
	const folder = mkdtempSync(join(tmpdir(), "virello-packages-test-"));
	if (!resolve(folder).startsWith(resolve(tmpdir()) + sep))
		throw new Error("Unsafe package test folder.");
	const original = readFileSync(
		join(import.meta.dir, "../../package.json"),
		"utf8",
	);
	try {
		const [builders, umbrella] = await packPackages(join(folder, "artifacts"));
		const dependencies = await installedDependencies(join(folder, "artifacts"));
		const entries = await new Bun.Archive(
			await Bun.file(builders!).arrayBuffer(),
		).files();
		for (const license of [
			"LICENSE",
			"NOTICE",
			"UPSTREAM-LICENSE",
			"VIRELLO-LICENSE",
			"src/util/LICENSE",
		])
			expect(entries.has(`package/${license}`)).toBe(true);
		const rootEntries = await new Bun.Archive(
			await Bun.file(umbrella!).arrayBuffer(),
		).files();
		const published = JSON.parse(
			await rootEntries.get("package/package.json")!.text(),
		);
		expect(published.dependencies["@virello/builders"]).toBe(manifest.version);
		expect(published.workspaces).toBeUndefined();
		for (const mode of ["builders", "umbrella"]) {
			const cwd = join(folder, mode);
			mkdirSync(cwd);
			writeFileSync(
				join(cwd, "package.json"),
				JSON.stringify({
					private: true,
					type: "module",
					dependencies:
						mode === "builders"
							? { "@virello/builders": builders }
							: { virello: umbrella },
					// Resolve the not-yet-published transitive package from its local archive.
					overrides: {
						...dependencies,
						...(mode === "umbrella" ? { "@virello/builders": builders } : {}),
					},
				}),
			);
			await run(cwd, [
				"install",
				"--production",
				"--offline",
				"--ignore-scripts",
			]);
			writeFileSync(
				join(cwd, "probe.ts"),
				mode === "builders"
					? `
import { SlashCommandBuilder, AttachmentBuilder } from "@virello/builders";
if (new SlashCommandBuilder().setName("ticket").setDescription("Open a ticket").toJSON().name !== "ticket") throw Error("command");
if (new AttachmentBuilder().setFilename("ticket.txt").setFileData("transcript").getFile()?.name !== "ticket.txt") throw Error("attachment");
console.log("ok");`
					: `
import { SlashCommandBuilder as Root, ShardCoordinator } from "virello";
import { SlashCommandBuilder as Subpath } from "virello/builders";
import { SlashCommandBuilder as Scoped } from "@virello/builders";
import { ShardCoordinator as Coordinator } from "virello/sharding";
if (Root !== Subpath || Subpath !== Scoped || ShardCoordinator !== Coordinator) throw Error("duplicate package identity");
console.log("ok");`,
			);
			expect((await run(cwd, ["probe.ts"])).trim()).toBe("ok");
		}
		expect(
			readFileSync(join(import.meta.dir, "../../package.json"), "utf8"),
		).toBe(original);
	} finally {
		rmSync(folder, { recursive: true, force: true });
	}
}, 60000);
