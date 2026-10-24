/** Freeze snapshots before handing them to application observers. */
export function freezeSnapshot<T>(value: T): Readonly<T> {
	if (value && typeof value === "object") {
		for (const child of Object.values(value)) freezeSnapshot(child);
		Object.freeze(value);
	}
	return value;
}

/** Internal observer support; handlers never participate in transport or lifecycle decisions. */
export abstract class ShardLifecycle<T> {
	private readonly observers = new Set<
		(event: Readonly<T>) => void | Promise<void>
	>();
	private observersClosed = false;
	/** Observe future snapshots. Delivery is deferred, errors are logged, and returned promises are not awaited. */
	public onLifecycle(
		listener: (event: Readonly<T>) => void | Promise<void>,
	): () => void {
		if (typeof listener !== "function")
			throw new TypeError("A lifecycle listener must be a function.");
		if (this.observersClosed)
			throw new Error("Lifecycle subscriptions are closed.");
		this.observers.add(listener);
		return () => {
			this.observers.delete(listener);
		};
	}
	protected abstract lifecycleListenerError(error: unknown): void;
	private observerFailed(error: unknown): void {
		try {
			this.lifecycleListenerError(error);
		} catch {
			/* Observers and custom loggers cannot interrupt supervision. */
		}
	}
	protected publishLifecycle(event: T): void {
		if (!this.observers.size || this.observersClosed) return;
		const snapshot = freezeSnapshot(event);
		const listeners = [...this.observers];
		queueMicrotask(() => {
			for (const listener of listeners) {
				if (!this.observers.has(listener)) continue;
				try {
					Promise.resolve(listener(snapshot)).catch((error) =>
						this.observerFailed(error),
					);
				} catch (error) {
					this.observerFailed(error);
				}
			}
		});
	}
	protected closeLifecycle(event: T): void {
		this.publishLifecycle(event);
		this.observersClosed = true;
		queueMicrotask(() => this.observers.clear());
	}
}
