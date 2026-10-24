import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { type } from "arktype";
import type { Resource, ResourceLanguage } from "i18next";
import type { LocalisationDiagnostic } from "./types";

const record = type("Record<string, unknown>");
const ignored = /^[._-]/;

/** Validate and copy JSON data, including programmatic i18next resources. */
export function resourceBundle(value: unknown): ResourceLanguage[string] {
	record.assert(value);
	if (Array.isArray(value))
		throw new TypeError(
			"A resource namespace must be an object, not an array.",
		);
	const seen = new Set<object>();
	function copy(item: unknown): unknown {
		if (item === null || typeof item === "string" || typeof item === "boolean")
			return item;
		if (typeof item === "number" && Number.isFinite(item)) return item;
		if (typeof item !== "object" || item === null || seen.has(item))
			throw new TypeError("Resources must contain acyclic JSON data.");
		if (
			!Array.isArray(item) &&
			Object.getPrototypeOf(item) !== Object.prototype &&
			Object.getPrototypeOf(item) !== null
		)
			throw new TypeError("Resource objects must be plain records.");
		seen.add(item);
		const result: Record<string, unknown> | unknown[] = Array.isArray(item)
			? []
			: {};
		for (const [key, child] of Object.entries(item)) {
			if (["__proto__", "constructor", "prototype"].includes(key))
				throw new TypeError(`Unsafe resource key "${key}".`);
			Object.defineProperty(result, key, {
				value: copy(child),
				enumerable: true,
				writable: true,
				configurable: true,
			});
		}
		seen.delete(item);
		return result;
	}
	return copy(value) as ResourceLanguage[string];
}

export interface ResourceFile {
	locale: string;
	namespace: string;
	path: string;
}
export async function scanResources(
	directory: string,
	report?: (diagnostic: LocalisationDiagnostic) => void,
): Promise<ResourceFile[]> {
	const files: ResourceFile[] = [];
	async function scan(path: string, locale: string, prefix: string) {
		const entries = (await readdir(path, { withFileTypes: true })).sort(
			(a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
		);
		for (const entry of entries) {
			if (ignored.test(entry.name)) continue;
			if (entry.isDirectory()) {
				try {
					await scan(
						join(path, entry.name),
						locale || entry.name,
						locale ? `${prefix}${entry.name}/` : "",
					);
				} catch (cause) {
					if (!report) throw cause;
					report({
						code: "resource",
						path: join(path, entry.name),
						message:
							"Cannot discover translation subdirectory; other resources continue.",
						cause,
					});
				}
			} else if (entry.isFile() && locale && entry.name.endsWith(".json"))
				files.push({
					locale,
					namespace: `${prefix}${entry.name.slice(0, -5)}`,
					path: join(path, entry.name),
				});
		}
	}
	await scan(directory, "", "");
	return files;
}

export async function loadResources(
	directories: readonly { path: string; optional: boolean }[],
	report: (diagnostic: LocalisationDiagnostic) => void,
): Promise<Resource> {
	const resources: Resource = Object.create(null);
	for (const directory of directories) {
		let files: ResourceFile[];
		try {
			files = await scanResources(directory.path, report);
		} catch (cause) {
			if (
				directory.optional &&
				(cause as NodeJS.ErrnoException).code === "ENOENT"
			)
				continue;
			report({
				code: "resource",
				path: directory.path,
				message: "Cannot discover translation directory.",
				cause,
			});
			continue;
		}
		for (const file of files) {
			try {
				const bundle = resourceBundle(await Bun.file(file.path).json());
				const language = (resources[file.locale] ??= Object.create(null));
				if (Object.hasOwn(language, file.namespace)) {
					report({
						code: "duplicate",
						...file,
						message:
							"Duplicate locale/namespace skipped; the first valid resource wins.",
					});
					continue;
				}
				language[file.namespace] = bundle;
			} catch (cause) {
				report({
					code: "resource",
					...file,
					message: "Invalid translation resource skipped.",
					cause,
				});
			}
		}
	}
	return resources;
}
