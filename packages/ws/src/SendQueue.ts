import {
	GatewayOpcodes as Op,
	type GatewaySendPayload,
} from "discord-api-types/v10";
import { integer, type $Clock } from "@virello/util/runtime";
import type { $GatewayCommand, $GatewaySendOptions } from "./types";

interface PendingSend {
	payload: $GatewayCommand;
	finish(error?: unknown): void;
}

/** Bounded FIFO application sends; control writes retain reserved connection capacity. */
export class SendQueue {
	private readonly pending = new Set<PendingSend>();
	private readonly starts: number[] = [];
	private readonly presences: number[] = [];
	private readonly members = new Map<string, number>();
	private wake?: unknown;
	private draining = false;
	public constructor(
		private readonly clock: $Clock,
		private readonly maximum: number,
		private readonly write: (payload: $GatewayCommand) => boolean,
	) {}
	public get size(): number {
		return this.pending.size;
	}
	private prune(): void {
		const now = this.clock.now();
		while (this.starts.length && this.starts[0] <= now - 60000)
			this.starts.shift();
		while (this.presences.length && this.presences[0] <= now - 20000)
			this.presences.shift();
		for (const [guild, until] of this.members)
			if (until <= now) this.members.delete(guild);
	}
	/** Enforce Discord's hard connection limit even for transport-owned control writes. */
	public canWrite(): boolean {
		this.prune();
		return this.starts.length < 120;
	}
	/** Charge before the socket write, whose outcome may be unknown on a transport failure. */
	public record(payload: GatewaySendPayload): void {
		const now = this.clock.now();
		this.starts.push(now);
		if (
			payload.op === Op.PresenceUpdate ||
			(payload.op === Op.Identify && payload.d.presence)
		)
			this.presences.push(now);
		if (
			payload.op === Op.RequestGuildMembers &&
			"query" in payload.d &&
			payload.d.query === "" &&
			payload.d.limit === 0
		)
			this.members.set(payload.d.guild_id, now + 30000);
	}
	/** Honor a server cooldown without replaying the rejected command. */
	public limited(guild: string, seconds: number): void {
		if (!Number.isFinite(seconds) || seconds <= 0 || !this.members.has(guild))
			return;
		this.prune();
		this.members.set(
			guild,
			Math.max(
				this.members.get(guild) ?? 0,
				this.clock.now() + Math.min(seconds * 1000, Number.MAX_SAFE_INTEGER),
			),
		);
		this.pump();
	}
	public add(
		payload: $GatewayCommand,
		options: $GatewaySendOptions,
	): Promise<void> {
		const deadlineMs = integer(
			options.deadlineMs ?? 15000,
			"Gateway deadlineMs",
			1,
		);
		if (deadlineMs > 300000)
			return Promise.reject(
				new RangeError("Gateway deadlineMs must not exceed 300000."),
			);
		if (options.signal?.aborted) return Promise.reject(options.signal.reason);
		if (this.pending.size >= this.maximum)
			return Promise.reject(new Error("Gateway send queue capacity exceeded."));
		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const entry: PendingSend = {
				payload,
				finish: (error) => {
					if (settled) return;
					settled = true;
					this.pending.delete(entry);
					this.clock.clearTimeout(timer);
					options.signal?.removeEventListener("abort", abort);
					if (error === undefined) resolve();
					else reject(error);
				},
			};
			const abort = () => {
				entry.finish(options.signal!.reason);
				this.pump();
			};
			const timer = this.clock.setTimeout(() => {
				entry.finish(
					new Error("Gateway send deadline elapsed before transmission."),
				);
				this.pump();
			}, deadlineMs);
			this.pending.add(entry);
			options.signal?.addEventListener("abort", abort, { once: true });
			this.pump();
		});
	}
	/** Reject unsent work on reconnect, reassignment, or closure; never replay it. */
	public reset(error: Error): void {
		if (this.wake !== undefined) this.clock.clearTimeout(this.wake);
		this.wake = undefined;
		for (const entry of this.pending) entry.finish(error);
	}
	private pump(): void {
		if (this.draining) return;
		this.draining = true;
		if (this.wake !== undefined) this.clock.clearTimeout(this.wake);
		this.wake = undefined;
		try {
			for (const entry of this.pending) {
				this.prune();
				const now = this.clock.now();
				// Reserve five slots for heartbeats and connection management.
				let at =
					this.starts.length >= 115
						? this.starts[this.starts.length - 115] + 60000
						: now;
				if (
					entry.payload.op === Op.PresenceUpdate &&
					this.presences.length >= 5
				)
					at = Math.max(at, this.presences[this.presences.length - 5] + 20000);
				if (
					entry.payload.op === Op.RequestGuildMembers &&
					"query" in entry.payload.d &&
					entry.payload.d.query === "" &&
					entry.payload.d.limit === 0
				)
					at = Math.max(at, this.members.get(entry.payload.d.guild_id) ?? now);
				if (at > now) {
					this.wake = this.clock.setTimeout(
						() => {
							this.wake = undefined;
							this.pump();
						},
						Math.min(at - now, 300000),
					);
					return;
				}
				// Detach cancels only unsent work; a failed active write has an unknown outcome.
				this.pending.delete(entry);
				if (this.write(entry.payload)) entry.finish();
				else
					entry.finish(
						new Error(
							"Gateway write failed; delivery may be unknown. The command was not replayed.",
						),
					);
			}
		} finally {
			this.draining = false;
		}
	}
}
