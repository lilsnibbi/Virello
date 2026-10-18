import type { $Clock } from "../../src/engine/common";
import { record } from "../../src/engine/common";
import type { $GatewaySocket } from "../../src/engine/gateway/GatewayShard";

export class FakeClock implements $Clock {
	public time = 0;
	public jitter = 0.5;
	private next = 0;
	private readonly timers = new Map<number, { at: number; run: () => void }>();
	public now(): number {
		return this.time;
	}
	public random(): number {
		return this.jitter;
	}
	public get pending(): number {
		return this.timers.size;
	}
	public setTimeout(run: () => void, milliseconds: number): unknown {
		const id = ++this.next;
		this.timers.set(id, { at: this.time + milliseconds, run });
		return id;
	}
	public clearTimeout(id: unknown): void {
		if (typeof id === "number") this.timers.delete(id);
	}
	public tick(milliseconds: number): void {
		const end = this.time + milliseconds;
		for (let count = 0; count < 10_000; count++) {
			const next = [...this.timers]
				.filter(([, timer]) => timer.at <= end)
				.sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
			if (!next) {
				this.time = end;
				return;
			}
			this.timers.delete(next[0]);
			this.time = next[1].at;
			next[1].run();
		}
		throw new Error("Timer loop did not settle.");
	}
	public async advance(milliseconds: number): Promise<void> {
		this.tick(milliseconds);
		await flush();
	}
}
export async function flush(): Promise<void> {
	for (let i = 0; i < 30; i++) await Promise.resolve();
}

export class FakeSocket implements $GatewaySocket {
	public binaryType: BinaryType = "arraybuffer";
	public readyState: $GatewaySocket["readyState"] = WebSocket.OPEN;
	public onopen: $GatewaySocket["onopen"] = null;
	public onmessage: $GatewaySocket["onmessage"] = null;
	public onclose: $GatewaySocket["onclose"] = null;
	public onerror: $GatewaySocket["onerror"] = null;
	public readonly sent: Record<string, unknown>[] = [];
	public closed?: number;
	public send(data: Parameters<WebSocket["send"]>[0]): void {
		if (typeof data !== "string") throw new Error("Expected JSON text.");
		const parsed: unknown = JSON.parse(data);
		if (!record(parsed)) throw new Error("Invalid outgoing frame.");
		this.sent.push(parsed);
	}
	public close(code = 1000): void {
		this.closed = code;
		this.readyState = WebSocket.CLOSED;
	}
	public raw(data: unknown): void {
		this.onmessage?.call(
			this as unknown as WebSocket,
			new MessageEvent("message", { data }),
		);
	}
	public receive(payload: unknown): void {
		this.raw(JSON.stringify(payload));
	}
	public disconnect(code: number): void {
		this.readyState = WebSocket.CLOSED;
		this.onclose?.call(
			this as unknown as WebSocket,
			new CloseEvent("close", { code }),
		);
	}
}
