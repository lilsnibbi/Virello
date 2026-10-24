import type { $Clock } from "@virello/util/runtime";

/** Tracks the oldest unacknowledged heartbeat, including server-requested beats. */
export class Heartbeat {
	private timer?: unknown;
	private awaitingSince?: number;
	private interval = 0;
	private running = false;
	/** Last acknowledged heartbeat latency, or null before an acknowledgement. */
	public latency: number | null = null;
	public constructor(
		private readonly clock: $Clock,
		private readonly send: () => void,
		private readonly missed: () => void,
	) {}
	public start(interval: number): void {
		this.stop();
		this.interval = interval;
		this.running = true;
		this.schedule(interval * this.clock.random());
	}
	public acknowledge(): void {
		if (this.awaitingSince !== undefined)
			this.latency = Math.max(0, this.clock.now() - this.awaitingSince);
		this.awaitingSince = undefined;
	}
	public request(): void {
		if (!this.running) return;
		this.awaitingSince ??= this.clock.now();
		this.send();
	}
	private schedule(milliseconds: number): void {
		this.timer = this.clock.setTimeout(() => {
			if (!this.running) return;
			if (
				this.awaitingSince !== undefined &&
				this.clock.now() - this.awaitingSince >= this.interval
			) {
				this.missed();
				return;
			}
			this.request();
			if (this.running) this.schedule(this.interval);
		}, milliseconds);
	}
	public stop(): void {
		this.running = false;
		this.latency = null;
		if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
		this.timer = undefined;
		this.awaitingSince = undefined;
	}
}
