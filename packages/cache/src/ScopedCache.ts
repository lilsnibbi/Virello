import { CacheStore } from "./CacheStore";
import type { $CacheEntry, $Patch } from "./types";

/** Separate bounded cache for each guild, channel, or other scope. */
export class ScopedCache<T extends object> {
	private readonly scopes = new Map<string, CacheStore<T>>();
	/**
	 * Create a lazily allocated set of scoped caches.
	 * @param limit - Per-scope limit, or callback evaluated when a scope is created. Return 0 to disable that scope.
	 */
	public constructor(
		private readonly limit: number | ((scope: string) => number),
	) {}
	/** Number of allocated scope caches. */
	public get scopeCount(): number {
		return this.scopes.size;
	}
	/**
	 * Count entries in one scope; returns 0 for a missing scope.
	 * @param scope - Scope ID.
	 */
	public size(scope: string): number {
		return this.scopes.get(scope)?.size ?? 0;
	}
	/**
	 * Read an entry and mark it recently used within its scope.
	 * @param scope - Scope ID.
	 * @param id - Entity ID.
	 * @returns The cached entry, or undefined.
	 */
	public get(scope: string, id: string): $CacheEntry<T> | undefined {
		return this.scopes.get(scope)?.get(id);
	}
	/**
	 * Read an entry without changing its eviction position.
	 * @param scope - Scope ID.
	 * @param id - Entity ID.
	 * @returns The cached entry, or undefined.
	 */
	public peek(scope: string, id: string): $CacheEntry<T> | undefined {
		return this.scopes.get(scope)?.peek(id);
	}
	/**
	 * Mark an existing scoped entry recently used. Missing scopes and IDs are ignored.
	 * @param scope - Scope ID.
	 * @param id - Entity ID.
	 */
	public touch(scope: string, id: string): void {
		this.scopes.get(scope)?.touch(id);
	}
	/**
	 * Store full data and mark it complete in one scope.
	 * @param scope - Scope ID.
	 * @param id - Entity ID.
	 * @param data - Full native entity.
	 * @returns The entry, or undefined when the scope’s cache is disabled.
	 */
	public put(scope: string, id: string, data: T): $CacheEntry<T> | undefined {
		return this.store(scope)?.put(id, data);
	}
	/**
	 * Merge known fields within one scope without promoting a partial entry to complete.
	 * @param scope - Scope ID.
	 * @param id - Entity ID.
	 * @param data - Partial entity fields.
	 * @returns The entry, or undefined when the scope’s cache is disabled.
	 */
	public patch(
		scope: string,
		id: string,
		data: $Patch<T>,
	): $CacheEntry<T> | undefined {
		return this.store(scope)?.patch(id, data);
	}
	/**
	 * Remove an entry and release its scope when empty.
	 * @param scope - Scope ID.
	 * @param id - Entity ID.
	 * @returns The previous entry, or undefined.
	 */
	public delete(scope: string, id: string): $CacheEntry<T> | undefined {
		const store = this.scopes.get(scope);
		const previous = store?.delete(id);
		if (!store?.size) this.scopes.delete(scope);
		return previous;
	}
	/**
	 * Remove one scope, or every scope when omitted.
	 * @param scope - Optional scope ID.
	 */
	public clear(scope?: string): void {
		if (scope === undefined) this.scopes.clear();
		else this.scopes.delete(scope);
	}
	/**
	 * Iterate [ID, entry] pairs in one scope, from least to most recently used. Missing scopes yield nothing.
	 * @param scope - Scope ID.
	 */
	public *entries(scope: string): IterableIterator<[string, $CacheEntry<T>]> {
		const store = this.scopes.get(scope);
		if (store) yield* store;
	}
	/**
	 * Iterate entries in one scope, from least to most recently used. Missing scopes yield nothing.
	 * @param scope - Scope ID.
	 */
	public *values(scope: string): IterableIterator<$CacheEntry<T>> {
		const store = this.scopes.get(scope);
		if (store) yield* store.values();
	}
	/** Iterate allocated scope IDs in creation order. */
	public scopeIds(): MapIterator<string> {
		return this.scopes.keys();
	}
	private store(scope: string): CacheStore<T> | undefined {
		if (this.limit === 0) return undefined;
		const current = this.scopes.get(scope);
		if (current) return current;
		const store = new CacheStore<T>(
			typeof this.limit === "number" ? this.limit : this.limit(scope),
		);
		if (!store.limit) return undefined;
		this.scopes.set(scope, store);
		return store;
	}
}
