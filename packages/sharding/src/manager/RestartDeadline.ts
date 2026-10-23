import { ShardError } from "../types";

/** One bounded budget for an explicit restart, including all selected slots. */
export class RestartDeadline {
	private readonly end: number;
	public constructor(
		milliseconds: number,
		private readonly signal: AbortSignal,
	) {
		if (
			!Number.isInteger(milliseconds) ||
			milliseconds < 1 ||
			milliseconds > 3600000
		)
			throw new TypeError("Restart timeoutMs must be 1..3600000.");
		this.end = performance.now() + milliseconds;
	}
	public check(): number {
		if (this.signal.aborted)
			throw this.signal.reason instanceof ShardError
				? this.signal.reason
				: new ShardError("ABORTED", "Restart cancelled.");
		const remaining = Math.floor(this.end - performance.now());
		if (remaining <= 0)
			throw new ShardError("TIMEOUT", "Restart deadline elapsed.");
		return remaining;
	}
	public async wait<T>(task: Promise<T>): Promise<T> {
		// Observe task even if cancellation has already won. Safety cleanup can finish after this wait ends.
		void task.catch(() => {});
		const remaining = this.check();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let abort: () => void = () => {};
		try {
			return await Promise.race([
				task,
				new Promise<never>((_resolve, reject) => {
					abort = () =>
						reject(
							this.signal.reason instanceof ShardError
								? this.signal.reason
								: new ShardError("ABORTED", "Restart cancelled."),
						);
					this.signal.addEventListener("abort", abort, { once: true });
					timer = setTimeout(
						() =>
							reject(new ShardError("TIMEOUT", "Restart deadline elapsed.")),
						remaining,
					);
				}),
			]);
		} finally {
			clearTimeout(timer);
			this.signal.removeEventListener("abort", abort);
		}
	}
}
