import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as ts from "typescript/unstable/ast";
import { API } from "typescript/unstable/async";
import baseline from "./public-api.json";

/** Validate the root entrypoint and its public export contract. */
export async function auditExports(
	root: string,
	failures: string[],
): Promise<void> {
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	const paths = baseline.paths;
	if (
		JSON.stringify(Object.keys(manifest.exports).sort()) !==
		JSON.stringify(paths.sort())
	)
		failures.push("Package paths differ from the supported public contract.");
	if (manifest.types !== "./index.ts")
		failures.push("Root type fallback changed.");
	const entries = new Map<string, string>();
	for (const path of paths) {
		const expected =
			path === "." ? "./index.ts" : `./src/core/public/${path.slice(2)}.ts`;
		const conditions = manifest.exports[path];
		if (
			!conditions ||
			JSON.stringify(Object.keys(conditions)) !==
				JSON.stringify(["types", "bun"]) ||
			conditions.types !== expected ||
			conditions.bun !== expected
		) {
			failures.push(`Expected matching types/bun conditions only: ${path}`);
			continue;
		}
		const file = resolve(root, expected);
		if (!existsSync(file)) {
			failures.push(`Missing public entrypoint: ${path}`);
			continue;
		}
		entries.set(path, file);
	}
	const temporary = mkdtempSync(join(tmpdir(), "virello-exports-"));
	let api: API | undefined;
	try {
		api = new API({ cwd: root });
		const config = join(temporary, "tsconfig.json");
		writeFileSync(
			config,
			JSON.stringify({
				files: [...entries.values()],
				compilerOptions: {
					module: "Preserve",
					moduleResolution: "Bundler",
					customConditions: ["bun"],
					target: "ESNext",
					skipLibCheck: true,
					noEmit: true,
				},
			}),
		);
		const snapshot = await api.updateSnapshot({ openProjects: [config] });
		const project = snapshot.getProject(config);
		if (!project)
			throw new Error("Could not open the public export audit project.");
		const { program, checker } = project;
		for (const [path, file] of entries) {
			if (path !== ".") continue;
			const syntax = await program.getSourceFile(file);
			if (!syntax) {
				failures.push(`Missing TypeScript source file: ${path}`);
				continue;
			}
			if (syntax.statements.length !== 1)
				failures.push("Root entrypoint must contain a single barrel export.");
			for (const statement of syntax.statements) {
				if (
					ts.isExportDeclaration(statement) &&
					!statement.isTypeOnly &&
					!statement.exportClause &&
					statement.moduleSpecifier &&
					ts.isStringLiteral(statement.moduleSpecifier) &&
					statement.moduleSpecifier.text === "./src/core/index"
				) {
					continue;
				}
				failures.push(
					`Public entrypoint must re-export ./src/core/index: ${path}`,
				);
			}
		}
		async function exported(file: string): Promise<Set<string>> {
			const source = await program.getSourceFile(file);
			const symbol = source && (await checker.getSymbolAtLocation(source));
			if (!symbol) {
				failures.push(`No TypeScript module at ${file}`);
				return new Set();
			}
			return new Set(
				(await checker.getExportsOfModule(symbol)).map((value) => value.name),
			);
		}
		const rootSymbols = await exported(resolve(root, "index.ts"));
		if (
			JSON.stringify([...rootSymbols.keys()].sort()) !==
			JSON.stringify(baseline.exports)
		)
			failures.push(
				`Public exports differ from the baseline. Missing: ${baseline.exports.filter((name) => !rootSymbols.has(name)).join(", ") || "none"}. Added: ${
					[...rootSymbols.keys()]
						.filter((name) => !baseline.exports.includes(name))
						.sort()
						.join(", ") || "none"
				}.`,
			);
	} finally {
		try {
			await api?.close();
		} finally {
			rmSync(temporary, { recursive: true, force: true });
		}
	}
}
