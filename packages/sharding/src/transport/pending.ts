import { ShardError } from "../types";
import { timeout } from "./protocol";

export class Pending {
	private readonly entries = new Map<
		string,
		{
			resolve: (v: unknown) => void;
			reject: (e: unknown) => void;
			clean: () => void;
		}
	>();
	public constructor(private readonly maximum: number) {}
	public get size(): number {
		return this.entries.size;
	}
	public create(
		id: string,
		milliseconds: number,
		signal?: AbortSignal,
		cancel?: () => void,
	): Promise<unknown> {
		timeout(milliseconds);
		if (signal?.aborted)
			return Promise.reject(
				signal.reason ?? new ShardError("ABORTED", "Request aborted."),
			);
		if (this.entries.size >= this.maximum || this.entries.has(id))
			return Promise.reject(
				new ShardError("CAPACITY", "Pending request capacity reached."),
			);
		return new Promise((resolve, reject) => {
			const abort = () => {
				this.reject(
					id,
					signal?.reason ?? new ShardError("ABORTED", "Request aborted."),
				);
				cancel?.();
			};
			const timer = setTimeout(() => {
				this.reject(id, new ShardError("TIMEOUT", "Shard request timed out."));
				cancel?.();
			}, milliseconds);
			this.entries.set(id, {
				resolve,
				reject,
				clean: () => {
					clearTimeout(timer);
					signal?.removeEventListener("abort", abort);
				},
			});
			signal?.addEventListener("abort", abort, { once: true });
		});
	}
	public has(id: string): boolean {
		return this.entries.has(id);
	}
	public resolve(id: string, value: unknown): void {
		const entry = this.take(id);
		entry?.resolve(value);
	}
	public reject(id: string, error: unknown): void {
		const entry = this.take(id);
		entry?.reject(error);
	}
	public close(
		error = new ShardError("DISCONNECTED", "Sharding connection closed."),
	): void {
		for (const id of this.entries.keys()) this.reject(id, error);
	}
	private take(id: string) {
		const entry = this.entries.get(id);
		if (entry) {
			this.entries.delete(id);
			entry.clean();
		}
		return entry;
	}
}
