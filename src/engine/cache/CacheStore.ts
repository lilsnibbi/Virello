import { integer } from "../common";
import { merge } from "./merge";
import type { $CacheEntry, $Patch } from "./types";

/** Bounded cache with least-recently-used eviction. Reads through get and writes refresh an entry’s position. */
export class CacheStore<T extends object> implements Iterable<
	[string, $CacheEntry<T>]
> {
	private readonly items = new Map<string, $CacheEntry<T>>();

	/**
	 * Create an empty cache.
	 * @param limit - Nonnegative safe integer or Infinity. Defaults to Infinity; 0 disables storage.
	 * @throws RangeError for an invalid limit.
	 */
	public constructor(
		/** Maximum stored entries. Defaults to Infinity; 0 disables storage. */
		public readonly limit = Number.POSITIVE_INFINITY,
	) {
		if (limit !== Number.POSITIVE_INFINITY) integer(limit, "cache limit");
	}
	/** Number of stored entries. */
	public get size(): number {
		return this.items.size;
	}
	/**
	 * Check whether an ID is stored without refreshing its eviction position.
	 * @param id - Entity ID.
	 * @returns Whether an entry exists.
	 */
	public has(id: string): boolean {
		return this.items.has(id);
	}
	/**
	 * Read an entry without refreshing its eviction position.
	 * @param id - Entity ID.
	 * @returns The stored entry, or undefined.
	 */
	public peek(id: string): $CacheEntry<T> | undefined {
		return this.items.get(id);
	}
	/**
	 * Read an entry and mark it recently used.
	 * @param id - Entity ID.
	 * @returns The stored entry, or undefined.
	 */
	public get(id: string): $CacheEntry<T> | undefined {
		this.touch(id);
		return this.items.get(id);
	}
	/**
	 * Mark an existing entry recently used. Missing IDs are ignored.
	 * @param id - Entity ID.
	 */
	public touch(id: string): void {
		const entry = this.items.get(id);
		if (!entry) return;
		this.items.delete(id);
		this.items.set(id, entry);
	}
	/**
	 * Merge full entity data, mark the entry complete, and evict the oldest entry if over capacity.
	 * @param id - Entity ID.
	 * @param data - Full native entity.
	 * @returns The stored entry, or undefined when storage is disabled.
	 */
	public put(id: string, data: T): $CacheEntry<T> | undefined {
		return this.write(id, data, true);
	}
	/**
	 * Merge known fields and refresh the entry. Existing complete entries stay complete.
	 * @param id - Entity ID.
	 * @param data - Partial entity fields; arrays replace previous arrays.
	 * @returns The stored entry, or undefined when storage is disabled.
	 */
	public patch(id: string, data: $Patch<T>): $CacheEntry<T> | undefined {
		return this.write(id, data, false);
	}
	private write(
		id: string,
		patch: object,
		complete: boolean,
	): $CacheEntry<T> | undefined {
		if (!this.limit) return undefined;
		let entry = this.items.get(id);
		if (!entry) {
			// This is the single completeness boundary; callers use put only with native full entities.
			entry = { complete, data: {} } as $CacheEntry<T>;
		}
		merge(entry.data, patch);
		if (complete) entry.complete = true;
		this.items.delete(id);
		this.items.set(id, entry);
		if (this.items.size > this.limit) {
			const first = this.items.keys().next();
			if (!first.done) this.items.delete(first.value);
		}
		return entry;
	}
	/**
	 * Remove an entry.
	 * @param id - Entity ID.
	 * @returns The previous entry, or undefined.
	 */
	public delete(id: string): $CacheEntry<T> | undefined {
		const previous = this.items.get(id);
		this.items.delete(id);
		return previous;
	}
	/** Remove every stored entry. */
	public clear(): void {
		this.items.clear();
	}
	/** Iterate entries from least to most recently used. */
	public values(): MapIterator<$CacheEntry<T>> {
		return this.items.values();
	}
	/** Iterate IDs from least to most recently used. */
	public keys(): MapIterator<string> {
		return this.items.keys();
	}
	/** Iterate [ID, entry] pairs from least to most recently used. */
	public [Symbol.iterator](): MapIterator<[string, $CacheEntry<T>]> {
		return this.items.entries();
	}
}
