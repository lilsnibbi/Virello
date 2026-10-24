import type { PathLike } from "node:fs";
import { opendir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Walk directories recursively and yield file paths without following symbolic-link entries.
 * @param path - Root directory.
 * @param predicate - Test each file’s basename, including extension. Defaults to accepting every file.
 * @returns Async iterator of paths joined to the root.
 * @throws If directory access or the predicate fails.
 */
export async function* findFilesRecursively(
	path: PathLike,
	predicate: (filePath: string) => boolean = () => true,
): AsyncIterableIterator<string> {
	const dir = await opendir(path);

	for await (const item of dir) {
		if (item.isFile() && predicate(item.name)) {
			yield join(dir.path, item.name);
		} else if (item.isDirectory()) {
			yield* findFilesRecursively(join(dir.path, item.name), predicate);
		}
	}
}

/**
 * Walk subdirectories and yield paths whose file basenames start with the literal text.
 * @param path - Directory to walk.
 * @param fileStartsWith - Case-sensitive text to match, without wildcard expansion.
 * @returns Lazy async iterator of matching paths. Filesystem failures reject iteration.
 */
export function findFilesRecursivelyStringStartsWith(
	path: PathLike,
	fileStartsWith: string,
) {
	return findFilesRecursively(path, (filePath) =>
		filePath.startsWith(fileStartsWith),
	);
}

/**
 * Walk subdirectories and yield paths whose file basenames end with the literal text.
 * @param path - Directory to walk.
 * @param fileEndsWith - Case-sensitive text to match, without wildcard expansion.
 * @returns Lazy async iterator of matching paths. Filesystem failures reject iteration.
 */
export function findFilesRecursivelyStringEndsWith(
	path: PathLike,
	fileEndsWith: string,
) {
	return findFilesRecursively(path, (filePath) =>
		filePath.endsWith(fileEndsWith),
	);
}

/**
 * Walk subdirectories and yield paths whose file basenames contain the literal text.
 * @param path - Directory to walk.
 * @param include - Case-sensitive text to match, without wildcard expansion.
 * @returns Lazy async iterator of matching paths. Filesystem failures reject iteration.
 */
export function findFilesRecursivelyStringIncludes(
	path: PathLike,
	include: string,
) {
	return findFilesRecursively(path, (filePath) => filePath.includes(include));
}

/**
 * Yield files whose basenames match the supplied regex. Global/sticky regex state is not reset.
 * @param path - Root directory.
 * @param regex - Basename test.
 * @returns An async file-path iterator; directory failures propagate.
 */
export function findFilesRecursivelyRegex(path: PathLike, regex: RegExp) {
	return findFilesRecursively(path, (filePath) => regex.test(filePath));
}
