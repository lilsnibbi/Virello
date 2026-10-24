import { ShardError } from "../types";
import { encode, frame, type Frame, type Limits } from "./protocol";

/** Bun IPC has no bufferedAmount. Receipt credits bound bytes handed to its native queue. */
export class IpcWindow {
	private sequence = 0;
	private received = 0;
	private bytes = 0;
	private readonly pending = new Map<number, number>();
	public constructor(private readonly policy: Limits) {}
	public send(message: Frame, write: (encoded: string) => void): void {
		if (message.op === "receipt") {
			write(encode(message, this.policy.maxBytes));
			return;
		}
		const sequence = ++this.sequence;
		const encoded = encode({ ...message, sequence }, this.policy.maxBytes);
		const bytes = Buffer.byteLength(encoded);
		if (
			this.pending.size >= Math.max(16, this.policy.maxPending) ||
			this.bytes + bytes > this.policy.maxBufferedBytes
		)
			throw new ShardError("BACKPRESSURE", "IPC receipt window is full.");
		this.pending.set(sequence, bytes);
		this.bytes += bytes;
		// An uncertain native send is never retried; its credit remains reserved.
		write(encoded);
	}
	public receive(
		message: Frame,
		acknowledge: (message: Frame) => void,
	): boolean {
		if (message.op === "receipt") {
			const bytes = this.pending.get(message.data.sequence);
			if (bytes !== undefined) {
				this.pending.delete(message.data.sequence);
				this.bytes -= bytes;
			}
			return false;
		}
		if (
			!Number.isSafeInteger(message.sequence) ||
			message.sequence! <= this.received
		)
			throw new ShardError(
				"PROTOCOL",
				"IPC delivery sequence is missing or stale.",
			);
		this.received = message.sequence!;
		acknowledge(frame("receipt", undefined, { sequence: message.sequence }));
		return true;
	}
}
