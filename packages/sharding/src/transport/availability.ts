import { type ShardCallOptions, ShardError } from "../types";
import { timeout } from "./protocol";

/** Only unsent, explicitly opted-in calls wait here. No payloads are replayed after disconnect. */
export class Availability {
	private ready = false;
	private closed = false;
	private readonly waiters = new Set<{
		resolve: () => void;
		reject: (error: unknown) => void;
	}>();
	public set(ready: boolean): void {
		this.ready = ready;
		if (ready) for (const waiter of [...this.waiters]) waiter.resolve();
	}
	public async prepare(
		options: ShardCallOptions,
		fallback: number,
		capacity: number,
	): Promise<ShardCallOptions> {
		const milliseconds = timeout(options.timeoutMs ?? fallback);
		const deadline = performance.now() + milliseconds;
		options.signal?.throwIfAborted();
		if (this.closed) throw new ShardError("CLOSED", "Sharding is closed.");
		if (!this.ready) {
			if (!options.waitForCoordinator)
				throw new ShardError(
					"DISCONNECTED",
					"Coordinator assignment is not reconciled.",
				);
			if (this.waiters.size >= capacity)
				throw new ShardError("CAPACITY", "Coordinator wait capacity reached.");
			await new Promise<void>((resolve, reject) => {
				const clean = () => {
					clearTimeout(timer);
					options.signal?.removeEventListener("abort", abort);
					this.waiters.delete(waiter);
				};
				const waiter = {
					resolve: () => {
						clean();
						resolve();
					},
					reject: (error: unknown) => {
						clean();
						reject(error);
					},
				};
				const abort = () =>
					waiter.reject(
						options.signal?.reason ??
							new ShardError("ABORTED", "Request aborted."),
					);
				const timer = setTimeout(
					() =>
						waiter.reject(
							new ShardError("TIMEOUT", "Coordinator wait timed out."),
						),
					milliseconds,
				);
				this.waiters.add(waiter);
				options.signal?.addEventListener("abort", abort, { once: true });
			});
		}
		const remaining = Math.floor(deadline - performance.now());
		if (remaining <= 0)
			throw new ShardError("TIMEOUT", "Shard request deadline elapsed.");
		return { ...options, timeoutMs: remaining };
	}
	public close(): void {
		this.closed = true;
		this.ready = false;
		for (const waiter of [...this.waiters])
			waiter.reject(new ShardError("CLOSED", "Sharding is closed."));
	}
}
