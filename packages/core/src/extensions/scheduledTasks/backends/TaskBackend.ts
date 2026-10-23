import type { TaskRecord, TaskState } from "../types/TaskTypes";

/** Mutations must be atomic; a stale lease cannot overwrite another worker. */
export interface TaskBackend {
	connect(): Promise<void>;
	put(job: TaskRecord): Promise<TaskRecord>;
	get(id: string): Promise<TaskRecord | undefined>;
	list(): Promise<TaskRecord[]>;
	claim(token: string, leaseDuration: number): Promise<TaskRecord | undefined>;
	renew(id: string, token: string, leaseDuration: number): Promise<boolean>;
	settle(
		id: string,
		token: string,
		next: TaskRecord | undefined,
	): Promise<boolean>;
	delete(id: string): Promise<boolean>;
	cleanup(states: TaskState[], before: number): Promise<number>;
	close(): Promise<void>;
}
