import { realpath, stat } from "node:fs/promises";
import {
	basename,
	dirname,
	isAbsolute,
	relative,
	resolve,
	sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { Glob } from "bun";

/** Include patterns, followed by optional !exclusions. Paths use / on every platform. */
export type ModulePatterns = string | readonly string[];

export function isModuleFile(path: string): boolean {
	const name = basename(path);
	return (
		name.endsWith(".ts") && !name.endsWith(".d.ts") && !/^[._-]/.test(name)
	);
}

/** Resolve a root without guessing a directory from the entry point. */
export function moduleRoot(root: string | URL = process.cwd()): string {
	return resolve(root instanceof URL ? fileURLToPath(root) : root);
}

function normalize(pattern: string): string {
	if (typeof pattern !== "string" || !pattern.trim() || pattern.includes("\0"))
		throw new TypeError("Module patterns must be non-empty strings.");
	const value = sep === "\\" ? pattern.replaceAll("\\", "/") : pattern;
	const stack: string[] = [];
	for (let index = 0; index < value.length; index++) {
		const char = value[index];
		if (char === "\\") {
			index++;
			continue;
		}
		if (char === "[") {
			const end = value.indexOf("]", index + 1);
			if (end <= index + 1)
				throw new TypeError(
					`Unclosed or empty character class in module pattern: ${pattern}`,
				);
			index = end;
			continue;
		}
		if (char === "{") {
			stack.push(char);
			if (stack.length > 10)
				throw new TypeError("Module glob braces are nested too deeply.");
		}
		if (char === "}" && !stack.pop())
			throw new TypeError(`Unmatched brace in module pattern: ${pattern}`);
	}
	if (stack.length)
		throw new TypeError(`Unclosed brace in module pattern: ${pattern}`);
	return value;
}

/** A compiled set of Bun globs for startup discovery. */
export class ModuleGlob {
	readonly root: string;
	readonly includes: Glob[];
	readonly excludes: Glob[];
	private readonly scans: { cwd: string; glob: Glob }[];

	constructor(root: string, patterns: ModulePatterns) {
		this.root = moduleRoot(root);
		const values = typeof patterns === "string" ? [patterns] : patterns;
		if (!Array.isArray(values) || values.length === 0)
			throw new TypeError("Supply at least one module include pattern.");
		const includes: string[] = [],
			excludes: string[] = [];
		for (const pattern of values) {
			const value = normalize(pattern);
			const excluded = value.startsWith("!");
			const body = excluded ? value.slice(1) : value;
			if (!body || body.startsWith("!"))
				throw new TypeError(`Invalid module exclusion: ${pattern}`);
			const absolute = isAbsolute(body) ? body : resolve(this.root, body);
			(excluded ? excludes : includes).push(absolute.replaceAll("\\", "/"));
		}
		if (!includes.length)
			throw new TypeError("Module exclusions need an include pattern.");
		this.includes = includes.map((pattern) => new Glob(pattern));
		this.excludes = excludes.map((pattern) => new Glob(pattern));
		this.scans = includes.map((pattern) => {
			const magic = pattern.search(/[?*[{]/);
			const cwd = resolve(
				magic < 0
					? dirname(pattern)
					: pattern.slice(0, pattern.lastIndexOf("/", magic) + 1),
			);
			return {
				cwd,
				glob: new Glob(relative(cwd, pattern).replaceAll("\\", "/")),
			};
		});
	}

	matches(path: string): boolean {
		const full = resolve(path).replaceAll("\\", "/");
		return (
			this.includes.some((glob) => glob.match(full)) &&
			!this.excludes.some((glob) => glob.match(full))
		);
	}

	async files(
		onError?: (path: string, cause: unknown) => void,
	): Promise<string[]> {
		const files = new Map<string, string>();
		for (const { cwd, glob } of this.scans) {
			// Bun's absolute exact-file scan misses files on Windows. Scan relative to the literal prefix.
			try {
				if (!(await stat(cwd)).isDirectory()) continue;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				if (onError) {
					onError(cwd, error);
					continue;
				}
				throw error;
			}
			try {
				for await (const file of glob.scan({
					cwd,
					absolute: true,
					onlyFiles: true,
					dot: true,
					followSymlinks: false,
					throwErrorOnBrokenSymlink: true,
				})) {
					if (!isModuleFile(file) || !this.matches(file)) continue;
					try {
						const canonical = await realpath(file);
						const key =
							process.platform === "win32"
								? canonical.toLowerCase()
								: canonical;
						files.set(key, canonical);
					} catch (cause) {
						if (!onError) throw cause;
						onError(file, cause);
					}
				}
			} catch (cause) {
				if (!onError) throw cause;
				onError(cwd, cause);
			}
		}
		return [...files.values()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	}

	relative(path: string): string {
		return relative(this.root, path);
	}
}
