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
import {
	API,
	type Symbol as ExportSymbol,
	SymbolFlags,
} from "typescript/unstable/sync";
import baseline from "../tests/fixtures/public.json";

/** Validate the same public contract in the checkout and the installed tarball. */
export function auditExports(root: string, failures: string[]): void {
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
	const paths = [
		".",
		"./engine",
		...baseline.categories.map((name) => `./${name}`),
	];
	if (
		JSON.stringify(Object.keys(manifest.exports).sort()) !==
		JSON.stringify(paths.sort())
	)
		failures.push("Package paths differ from the supported public contract.");
	if (manifest.types !== "./src/index.ts")
		failures.push("Root type fallback changed.");
	const entries = new Map<string, string>();
	for (const path of paths) {
		const expected =
			path === "." ? "./src/index.ts" : `./src/public/${path.slice(2)}.ts`;
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
		const snapshot = api.updateSnapshot({ openProjects: [config] });
		const project = snapshot.getProject(config);
		if (!project)
			throw new Error("Could not open the public export audit project.");
		const { program, checker } = project;
		for (const [path, file] of entries) {
			const syntax = program.getSourceFile(file);
			if (!syntax) {
				failures.push(`Missing TypeScript source file: ${path}`);
				continue;
			}
			for (const statement of syntax.statements) {
				if (
					ts.isImportDeclaration(statement) &&
					!statement.importClause &&
					ts.isStringLiteral(statement.moduleSpecifier) &&
					statement.moduleSpecifier.text ===
						(path === "." ? "./core/runtime" : "../core/runtime")
				)
					continue;
				if (
					ts.isExportDeclaration(statement) &&
					statement.moduleSpecifier &&
					ts.isStringLiteral(statement.moduleSpecifier)
				) {
					const dependency = statement.moduleSpecifier.text;
					if (
						path === "."
							? dependency.startsWith("./public/")
							: !dependency.startsWith("./") &&
								dependency !== "../index" &&
								!dependency.includes("/public/")
					)
						continue;
				}
				failures.push(
					`Public entrypoint must only re-export feature definitions and check Bun: ${path}`,
				);
			}
		}
		function exported(file: string): Map<string, ExportSymbol> {
			const source = program.getSourceFile(file);
			const symbol = source && checker.getSymbolAtLocation(source);
			if (!symbol) {
				failures.push(`No TypeScript module at ${file}`);
				return new Map();
			}
			return new Map(
				checker
					.getExportsOfModule(symbol)
					.map((value) => [
						value.name,
						value.flags & SymbolFlags.Alias
							? checker.getAliasedSymbol(value)
							: value,
					]),
			);
		}
		const rootSymbols = exported(resolve(root, "src/index.ts"));
		if (
			JSON.stringify([...rootSymbols.keys()].sort()) !==
			JSON.stringify(baseline.exports)
		)
			failures.push(
				"Root runtime/type export names changed from the compatibility baseline.",
			);
		const covered = new Set<string>();
		for (const name of baseline.categories) {
			for (const [key, symbol] of exported(
				resolve(root, `src/public/${name}.ts`),
			)) {
				covered.add(key);
				if (symbol !== rootSymbols.get(key))
					failures.push(
						`Different TypeScript identity or new private export: ${name}.${key}`,
					);
			}
		}
		if (
			JSON.stringify([...covered].sort()) !== JSON.stringify(baseline.exports)
		)
			failures.push(
				"Categories do not cover the complete root TypeScript API.",
			);
	} finally {
		try {
			api?.close();
		} finally {
			rmSync(temporary, { recursive: true, force: true });
		}
	}
}
