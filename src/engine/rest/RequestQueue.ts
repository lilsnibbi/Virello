import { type $Clock, integer } from "../common";

interface Job {
	run(): Promise<unknown>;
	resolve(value: unknown): void;
	reject(reason: unknown): void;
	signal: AbortSignal;
	key(): string;
	readyAt(): number;
	abort(): void;
}

/** Bounded concurrent scheduler; bucket keys are re-evaluated after every response. */
export class RequestQueue {
	private readonly jobs: Job[] = [];
	private readonly active = new Set<Job>();
	private wakeup?: unknown;
	public constructor(
		private readonly maximum: number,
		private readonly concurrency: number,
		private readonly clock: $Clock,
	) {
		integer(maximum, "maxPendingRequests", 1);
		integer(concurrency, "maxConcurrentRequests", 1);
	}
	public get size(): number {
		return this.jobs.length + this.active.size;
	}
	public add<T>(
		run: () => Promise<T>,
		signal: AbortSignal,
		key: () => string,
		readyAt: () => number,
	): Promise<T> {
		if (signal.aborted) return Promise.reject(signal.reason);
		if (this.size >= this.maximum)
			return Promise.reject(new Error("REST queue capacity exceeded."));
		return new Promise<T>((resolve, reject) => {
			const job: Job = {
				run,
				key,
				readyAt,
				resolve: (value) => resolve(value as T),
				reject,
				signal,
				abort: () => {
					const index = this.jobs.indexOf(job);
					if (index >= 0) {
						this.jobs.splice(index, 1);
						reject(signal.reason);
						this.pump();
					}
				},
			};
			this.jobs.push(job);
			signal.addEventListener("abort", job.abort, { once: true });
			this.pump();
		});
	}
	private pump(): void {
		if (this.wakeup !== undefined) this.clock.clearTimeout(this.wakeup);
		this.wakeup = undefined;
		while (this.active.size < this.concurrency) {
			const locked = new Set([...this.active].map((job) => job.key()));
			const index = this.jobs.findIndex(
				(job) => !locked.has(job.key()) && job.readyAt() <= this.clock.now(),
			);
			if (index < 0) break;
			const job = this.jobs.splice(index, 1)[0];
			if (!job) break;
			job.signal.removeEventListener("abort", job.abort);
			this.active.add(job);
			void this.run(job);
		}
		if (this.active.size >= this.concurrency) return;
		const locked = new Set([...this.active].map((job) => job.key()));
		let next = Number.POSITIVE_INFINITY;
		for (const job of this.jobs)
			if (!locked.has(job.key())) next = Math.min(next, job.readyAt());
		if (Number.isFinite(next))
			this.wakeup = this.clock.setTimeout(
				() => {
					this.wakeup = undefined;
					this.pump();
				},
				Math.max(1, Math.min(60_000, next - this.clock.now())),
			);
	}
	private async run(job: Job): Promise<void> {
		try {
			job.signal.throwIfAborted();
			job.resolve(await job.run());
		} catch (error) {
			job.reject(error);
		} finally {
			this.active.delete(job);
			this.pump();
		}
	}
}
