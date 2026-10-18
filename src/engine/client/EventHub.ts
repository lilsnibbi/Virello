import { errorOf, integer } from "../common";

type Listener = (value: unknown) => void | Promise<void>;

/** Invokes in registration order; returned promises never block cache processing. */
export class EventHub<Events extends object> {
	private readonly listeners = new Map<keyof Events, Set<Listener>>();
	private readonly pending = new Set<Promise<void>>();
	private closed = false;
	public constructor(
		private readonly maximum: number,
		private readonly failure: (error: Error, fatal: boolean) => void,
	) {
		integer(maximum, "maxPendingHandlers", 1);
	}
	public get pendingCount(): number {
		return this.pending.size;
	}
	public on<K extends keyof Events>(
		name: K,
		handler: (event: Events[K]) => void | Promise<void>,
	): () => void {
		if (this.closed) throw new Error("Event hub is closed.");
		let listeners = this.listeners.get(name);
		if (!listeners) {
			listeners = new Set();
			this.listeners.set(name, listeners);
		}
		const listener = handler as Listener;
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
			if (!listeners.size && this.listeners.get(name) === listeners)
				this.listeners.delete(name);
		};
	}
	public emit<K extends keyof Events>(name: K, value: Events[K]): void {
		if (this.closed) return;
		for (const listener of [...(this.listeners.get(name) ?? [])]) {
			if (this.closed) return;
			if (this.pending.size >= this.maximum) {
				this.failure(
					new Error("Pending event handler capacity exceeded; client stopped."),
					true,
				);
				return;
			}
			try {
				const result = listener(value);
				if (result !== undefined) {
					const task = Promise.resolve(result).catch((error: unknown) =>
						this.failure(errorOf(error), false),
					);
					this.pending.add(task);
					void task.finally(() => this.pending.delete(task));
				}
			} catch (error) {
				this.failure(errorOf(error), false);
			}
		}
	}
	public close(): void {
		this.closed = true;
		this.listeners.clear();
	}
	/** Wait only when handlers are known to settle; shutdown does not wait on user code. */
	public async idle(): Promise<void> {
		await Promise.all([...this.pending]);
	}
}
