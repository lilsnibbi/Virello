import { AsyncQueueEntry } from "./_AsyncQueueEntry";

/** The AsyncQueue class used to sequentialize burst requests */
export class AsyncQueue {
	/** The number of entries in the queue, including the head. @seealso {@link queued} for the queued count. */
	public get remaining(): number {
		return this.promises.length;
	}

	/** The number of queued entries. @seealso {@link remaining} for the count with the head. */
	public get queued(): number {
		return this.remaining === 0 ? 0 : this.remaining - 1;
	}

	/** The promises array */
	private readonly promises: AsyncQueueEntry[] = [];

	/**
	 * Wait until this entry reaches the head. Pair admitted work with shift() in finally to release the next waiter.
	 * @param options - Optional cancellation for queued work.
	 * @returns Admission to the queue head; later signal aborts or abortAll reject queued entries.
	 */
	public wait(options?: Readonly<AsyncQueueWaitOptions>): Promise<void> {
		const entry = new AsyncQueueEntry(this);

		if (this.promises.length === 0) {
			this.promises.push(entry);
			return Promise.resolve();
		}

		this.promises.push(entry);
		if (options?.signal) entry.setSignal(options.signal);
		return entry.promise;
	}

	/** Unlocks the head lock and transfers the next lock (if any) to the head. */
	public shift(): void {
		if (this.promises.length === 0) return;
		if (this.promises.length === 1) {
			// Remove the head entry.
			this.promises.shift();
			return;
		}

		// Remove the head entry, making the 2nd entry the new one.
		// Then use the head entry, which will unlock the promise.
		this.promises.shift();
		this.promises[0].use();
	}

	/** Reject pending queue entries without releasing the active lock. */
	public abortAll(): void {
		// If there are no queued entries, skip early.
		if (this.queued === 0) return;

		// Abort all the entries except the head, that is why the loop starts at
		// 1 and not at 0.
		for (let i = 1; i < this.promises.length; ++i) {
			this.promises[i].abort();
		}

		this.promises.length = 1;
	}
}

/** Cancellation settings for an entry waiting behind the queue head. */
export interface AsyncQueueWaitOptions {
	/** Abort a queued wait when this signal later aborts. Already-aborted signals and an immediately admitted head are not rejected. */
	signal?: AbortSignal | undefined | null;
}
