import { RedisClient } from "bun";
import type {
	TaskRecord,
	TaskSchedulerOptions,
	TaskState,
} from "../types/TaskTypes";
import * as scripts from "./scripts";
import type { TaskBackend } from "./TaskBackend";

// Lua's cjson turns empty arrays into objects. Keep user payload JSON opaque.
function encode(job: TaskRecord): string {
	const { data, ...record } = job;
	return JSON.stringify({
		...record,
		payload: data === undefined ? null : JSON.stringify(data),
	});
}
function decode(raw: string): TaskRecord {
	const { payload, ...record } = JSON.parse(raw);
	return {
		...record,
		data: payload === null ? undefined : JSON.parse(payload),
	};
}

/** A private connection: ambient REDIS_URL never selects this backend. */
export class RedisBackend implements TaskBackend {
	private client?: RedisClient;
	private connecting?: Promise<void>;
	private closed = false;
	private readonly keys: string[];
	constructor(
		private readonly options: TaskSchedulerOptions & { redis_url: string },
	) {
		const prefix = `virello:tasks:v1:{${encodeURIComponent(options.queue ?? "scheduled-tasks")}}`;
		this.keys = [`${prefix}:jobs`, `${prefix}:due`, `${prefix}:leases`];
	}
	async connect(): Promise<void> {
		if (this.closed) throw new Error("Task storage is closed.");
		if (this.client?.connected) return;
		this.client ??= new RedisClient(this.options.redis_url, {
			connectionTimeout: this.options.connectionTimeout ?? 3000,
			enableOfflineQueue: false,
			autoReconnect: true,
			maxRetries: 1,
		});
		this.connecting ??= this.withDeadline(
			this.client.connect(),
			this.options.connectionTimeout ?? 3000,
		)
			.catch((cause) => {
				throw new Error(
					"Cannot connect to the explicitly configured scheduling Redis. No memory fallback was used.",
					{ cause },
				);
			})
			.finally(() => {
				this.connecting = undefined;
			});
		await this.connecting;
	}
	private async send(command: string, args: string[]): Promise<unknown> {
		await this.connect();
		if (this.closed) throw new Error("Task storage is closed.");
		return this.withDeadline(
			this.client!.send(command, args),
			this.options.commandTimeout ?? 5000,
		);
	}
	private async withDeadline<T>(
		operation: Promise<T>,
		milliseconds: number,
	): Promise<T> {
		const client = this.client;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			return await Promise.race([
				operation,
				new Promise<never>((_resolve, reject) => {
					timer = setTimeout(() => {
						client?.close();
						reject(
							new Error(`Scheduling Redis timed out after ${milliseconds}ms.`),
						);
					}, milliseconds);
				}),
			]);
		} catch (error) {
			client?.close();
			if (this.client === client) this.client = undefined;
			throw error;
		} finally {
			clearTimeout(timer);
		}
	}
	private eval(script: string, args: string[]): Promise<unknown> {
		return this.send("EVAL", [
			script,
			String(this.keys.length),
			...this.keys,
			...args,
		]);
	}
	async put(job: TaskRecord): Promise<TaskRecord> {
		return decode(
			(await this.eval(scripts.put, [
				job.id,
				encode(job),
				String(job.runAt),
			])) as string,
		);
	}
	async get(id: string): Promise<TaskRecord | undefined> {
		const raw = await this.send("HGET", [this.keys[0], id]);
		return raw ? decode(raw as string) : undefined;
	}
	async list(): Promise<TaskRecord[]> {
		return ((await this.send("HVALS", [this.keys[0]])) as string[]).map(decode);
	}
	async claim(
		token: string,
		leaseDuration: number,
	): Promise<TaskRecord | undefined> {
		const raw = await this.eval(scripts.claim, [token, String(leaseDuration)]);
		return raw ? decode(raw as string) : undefined;
	}
	async renew(
		id: string,
		token: string,
		leaseDuration: number,
	): Promise<boolean> {
		return (
			(await this.eval(scripts.renew, [id, token, String(leaseDuration)])) === 1
		);
	}
	async settle(
		id: string,
		token: string,
		next: TaskRecord | undefined,
	): Promise<boolean> {
		return (
			(await this.eval(scripts.settle, [
				id,
				token,
				next ? encode(next) : "",
			])) === 1
		);
	}
	async delete(id: string): Promise<boolean> {
		return (await this.eval(scripts.remove, [id])) === 1;
	}
	async cleanup(states: TaskState[], before: number): Promise<number> {
		return (await this.eval(scripts.cleanup, [
			JSON.stringify(states),
			String(before),
		])) as number;
	}
	async close(): Promise<void> {
		this.closed = true;
		await this.connecting?.catch(() => {});
		this.client?.close();
	}
}
