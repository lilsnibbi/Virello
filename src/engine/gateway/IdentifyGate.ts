import type { RESTGetAPIGatewayBotResult } from "discord-api-types/v10";
import { type $Clock, delay, integer } from "../common";

/** Local session budget. A coordinator must supply permits when sharing a token across processes. */
export class IdentifyGate {
	private remaining: number;
	private resetAt: number;
	private nextAt = 0;
	private readonly total: number;
	private readonly resetAfter: number;
	public constructor(
		private readonly clock: $Clock,
		limit: RESTGetAPIGatewayBotResult["session_start_limit"],
	) {
		this.remaining = integer(limit.remaining, "session remaining");
		this.total = integer(limit.total, "session total", 1);
		this.resetAfter = integer(limit.reset_after, "session reset_after");
		integer(limit.max_concurrency, "session max_concurrency", 1);
		if (this.remaining > this.total)
			throw new RangeError("Session remaining exceeds total.");
		// Zero supplies no reusable reset interval. Spend only the reported budget
		// until fresh gateway metadata is obtained, rather than refilling per call.
		this.resetAt =
			this.resetAfter > 0
				? clock.now() + this.resetAfter
				: Number.POSITIVE_INFINITY;
	}
	public async acquire(signal: AbortSignal): Promise<void> {
		signal.throwIfAborted();
		while (this.nextAt > this.clock.now())
			await delay(this.clock, this.nextAt - this.clock.now(), signal);
		signal.throwIfAborted();
		if (this.clock.now() >= this.resetAt) {
			this.remaining = this.total;
			this.resetAt = this.clock.now() + this.resetAfter;
		}
		if (this.remaining <= 0)
			throw new Error(
				this.resetAfter === 0
					? "Discord session start budget exhausted. Fetch fresh gateway metadata before retrying."
					: "Discord session start budget exhausted. Retry after the reported reset.",
			);
		this.remaining--;
		this.nextAt = this.clock.now() + 5000;
	}
}
