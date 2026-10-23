import type { TaskRecord, TaskState } from "../types/TaskTypes";
import type { TaskBackend } from "./TaskBackend";

/** Process-local storage. Restarting loses every queued record. */
export class MemoryBackend implements TaskBackend {
	private readonly jobs = new Map<string, TaskRecord>();
	private closed = false;
	async connect(): Promise<void> {
		this.assertOpen();
	}
	async put(job: TaskRecord): Promise<TaskRecord> {
		this.assertOpen();
		if (!this.jobs.has(job.id)) this.jobs.set(job.id, structuredClone(job));
		return structuredClone(this.jobs.get(job.id)!);
	}
	async get(id: string): Promise<TaskRecord | undefined> {
		this.assertOpen();
		return structuredClone(this.jobs.get(id));
	}
	async list(): Promise<TaskRecord[]> {
		this.assertOpen();
		return structuredClone([...this.jobs.values()]);
	}
	async claim(
		token: string,
		leaseDuration: number,
	): Promise<TaskRecord | undefined> {
		this.assertOpen();
		const now = Date.now();
		for (const job of this.jobs.values())
			if (job.state === "active" && job.leaseUntil! <= now) {
				job.state = "waiting";
				job.runAt = now;
				delete job.token;
				delete job.leaseUntil;
			}
		const job = [...this.jobs.values()]
			.filter((job) => job.state === "waiting" && job.runAt <= now)
			.sort(
				(a, b) => a.runAt - b.runAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
			)[0];
		if (!job) return undefined;
		job.state = "active";
		job.token = token;
		job.leaseUntil = now + leaseDuration;
		job.updatedAt = now;
		job.attemptsMade++;
		return structuredClone(job);
	}
	async renew(
		id: string,
		token: string,
		leaseDuration: number,
	): Promise<boolean> {
		this.assertOpen();
		const job = this.jobs.get(id);
		if (job?.state !== "active" || job.token !== token) return false;
		job.leaseUntil = Date.now() + leaseDuration;
		return true;
	}
	async settle(
		id: string,
		token: string,
		next: TaskRecord | undefined,
	): Promise<boolean> {
		this.assertOpen();
		const job = this.jobs.get(id);
		if (job?.state !== "active" || job.token !== token) return false;
		if (next) {
			const saved = structuredClone(next);
			delete saved.token;
			delete saved.leaseUntil;
			this.jobs.set(id, saved);
		} else this.jobs.delete(id);
		return true;
	}
	async delete(id: string): Promise<boolean> {
		this.assertOpen();
		return this.jobs.delete(id);
	}
	async cleanup(states: TaskState[], before: number): Promise<number> {
		this.assertOpen();
		let count = 0;
		for (const job of this.jobs.values())
			if (
				job.state !== "active" &&
				job.state !== "waiting" &&
				states.includes(job.state) &&
				job.updatedAt < before
			) {
				this.jobs.delete(job.id);
				count++;
			}
		return count;
	}
	async close(): Promise<void> {
		this.closed = true;
		this.jobs.clear();
	}
	private assertOpen(): void {
		if (this.closed) throw new Error("Task storage is closed.");
	}
}
