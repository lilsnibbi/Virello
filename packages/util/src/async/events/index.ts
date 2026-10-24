import type { EventEmitter } from "node:events";

/** A filter for an EventIterator. */
export type EventIteratorFilter<V> = (value: V) => boolean;

/** Options to be passed to an EventIterator. */
export interface EventIteratorOptions<V> {
	/** The filter. */
	filter?: EventIteratorFilter<V>;

	/** The timeout in ms before ending the EventIterator. */
	idle?: number;

	/** The limit of events that pass the filter to iterate. */
	limit?: number;
}

/** An EventIterator, used for asynchronously iterating over received values. */
export class EventIterator<
	V extends unknown[],
> implements AsyncIterableIterator<V> {
	/** The emitter to listen to. */
	public readonly emitter: EventEmitter;

	/** The event the event iterator is listening for to receive values from. */
	public readonly event: string;

	/** The filter used to filter out values. */
	public filter: EventIteratorFilter<V>;

	/** Whether the EventIterator has ended. */
	#ended = false;

	/** The number of idle time in ms before moving on. */
	readonly #idle?: number;

	/** The queue of received values. */
	#queue: V[] = [];
	readonly #waiters = new Set<() => void>();

	/** The number of events that have passed the filter. */
	#passed = 0;

	/** The limit before ending the EventIterator. */
	readonly #limit: number;

	/** The timer to track when this will idle out. */
	readonly #idleTimer: NodeJS.Timeout | undefined | null = null;

	/** The push handler with context bound to the instance. */
	readonly #push: (this: EventIterator<V>, ...value: V) => void;

	/**
	 * Attach an event listener and queue argument tuples for asynchronous iteration.
	 * @param emitter - Source event emitter.
	 * @param event - Event name to collect.
	 * @param options - Optional filter, idle timeout, and accepted-value limit. The idle timer refreshes when a queued value
	 * is accepted by next().
	 */
	public constructor(
		emitter: EventEmitter,
		event: string,
		options: EventIteratorOptions<V> = {},
	) {
		this.emitter = emitter;
		this.event = event;
		this.#limit = options.limit ?? Infinity;
		this.#idle = options.idle;
		this.filter = options.filter ?? ((): boolean => true);

		// This timer is to idle out on lack of valid responses
		if (this.#idle)
			this.#idleTimer = setTimeout(this.end.bind(this), this.#idle);

		this.#push = this.push.bind(this);
		const maxListeners = this.emitter.getMaxListeners();
		if (maxListeners !== 0) this.emitter.setMaxListeners(maxListeners + 1);

		this.emitter.on(this.event, this.#push);
	}

	/** Whether the EventIterator has ended. */
	public get ended(): boolean {
		return this.#ended;
	}

	/** Ends the EventIterator. */
	public end(): void {
		if (this.#ended) return;
		this.#ended = true;
		this.#queue = [];
		if (this.#idleTimer) clearTimeout(this.#idleTimer);

		this.emitter.off(this.event, this.#push);
		const maxListeners = this.emitter.getMaxListeners();
		if (maxListeners !== 0) this.emitter.setMaxListeners(maxListeners - 1);
		for (const resume of this.#waiters) resume();
	}

	/** The next value that's received from the EventEmitter. */
	public async next(): Promise<IteratorResult<V>> {
		// If there are elements in the queue, return an undone response:
		if (this.#queue.length) {
			const value = this.#queue.shift()!;
			if (!this.filter(value)) return this.next();
			if (++this.#passed >= this.#limit) this.end();
			else if (this.#idleTimer) this.#idleTimer.refresh();
			return { done: false, value };
		}

		// If the iterator ended, return a done response:
		if (this.#ended) {
			return { done: true, value: undefined as never };
		}

		// Listen for a new element from the emitter:
		return new Promise<IteratorResult<V>>((resolve) => {
			const resume = () => {
				if (!this.#waiters.delete(resume)) return;
				this.emitter.off(this.event, resume);
				resolve(this.next());
			};
			this.#waiters.add(resume);
			this.emitter.once(this.event, resume);
		});
	}

	/** Handles what happens when you break or return from a loop. */
	public return(): Promise<IteratorResult<V>> {
		this.end();
		return Promise.resolve({ done: true, value: undefined as never });
	}

	/** Handles what happens when you encounter an error in a loop. */
	public throw(): Promise<IteratorResult<V>> {
		this.end();
		return Promise.resolve({ done: true, value: undefined as never });
	}

	/** The symbol allowing EventIterators to be used in for-await-of loops. */
	public [Symbol.asyncIterator](): AsyncIterableIterator<V> {
		return this;
	}

	/** Pushes a value into the queue. */
	protected push(...value: V): void {
		if (!this.#ended) this.#queue.push(value);
	}
}
