import { afterEach, describe, expect, test } from "bun:test";
import { RedisClient } from "bun";
import { MemoryBackend } from "../../../src/extensions/scheduledTasks/backends/MemoryBackend";
import { RedisBackend } from "../../../src/extensions/scheduledTasks/backends/RedisBackend";
import type { TaskBackend } from "../../../src/extensions/scheduledTasks/backends/TaskBackend";
import type { TaskRecord } from "../../../src/extensions/scheduledTasks/types/TaskTypes";

const backends: TaskBackend[] = [];
const records: { backend: TaskBackend; id: string }[] = [];
afterEach(async () => {
	for (const { backend, id } of records.splice(0))
		await backend.delete(id).catch(() => {});
	await Promise.all(backends.splice(0).map((backend) => backend.close()));
});
// Lease/state fixtures are already due, independent of small host/Redis clock offsets.
function job(id: string = crypto.randomUUID(), delay = -1000): TaskRecord {
	const now = Date.now();
	return {
		id,
		name: "test",
		data: { empty: [], nested: [[], null, { text: "hello" }] },
		state: "waiting",
		createdAt: now,
		updatedAt: now,
		runAt: now + delay,
		scheduledAt: now + delay,
		attemptsMade: 0,
		failures: 0,
		options: { removeOnComplete: false },
	};
}
function track(backend: TaskBackend): TaskBackend {
	backends.push(backend);
	return backend;
}
async function put(backend: TaskBackend, record = job()): Promise<TaskRecord> {
	records.push({ backend, id: record.id });
	return backend.put(record);
}
const url = process.env.VIRELLO_TEST_REDIS_URL;
if (url && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
	throw new Error("Live scheduling tests require a disposable loopback Redis.");

for (const storage of ["memory", "redis"] as const)
	describe.skipIf(storage === "redis" && !url)(
		`${storage} atomic task backend`,
		() => {
			const queue = () => `test-${crypto.randomUUID()}`;
			const create = (name = queue()) =>
				track(
					storage === "memory"
						? new MemoryBackend()
						: new RedisBackend({ redis_url: url!, queue: name }),
				);
			const clock = async () => {
				if (storage === "memory") return Date.now();
				const client = new RedisClient(url!);
				try {
					await client.connect();
					const [seconds, micros] = (await client.send("TIME", [])) as [
						string,
						string,
					];
					return Number(seconds) * 1000 + Math.floor(Number(micros) / 1000);
				} finally {
					client.close();
				}
			};
			test("creation is idempotent and returned payloads cannot mutate stored records", async () => {
				const backend = create();
				const record = job();
				const saved = await put(backend, record);
				const duplicate = await put(backend, {
					...record,
					name: "overwritten",
				});
				expect(duplicate.name).toBe("test");
				(saved.data as { nested: unknown[] }).nested.push("changed");
				expect((await backend.get(record.id))!.data).toEqual(record.data);
			});
			test("concurrent claimers never receive the same live lease", async () => {
				const name = queue();
				const first = create(name);
				const claimers =
					storage === "redis"
						? [first, create(name), create(name)]
						: [first, first, first];
				for (let i = 0; i < 12; i++) await put(first, job(`job-${i}`));
				const claimed = (
					await Promise.all(
						Array.from({ length: 30 }, (_, i) =>
							claimers[i % 3].claim(`worker-${i}`, 1000),
						),
					)
				).filter((entry): entry is TaskRecord => !!entry);
				expect(claimed).toHaveLength(12);
				expect(new Set(claimed.map((entry) => entry.id)).size).toBe(12);
				expect(
					claimed.every(
						(entry) => entry.state === "active" && entry.attemptsMade === 1,
					),
				).toBe(true);
			});
			test("delayed work is not claimed early and arrays survive Lua state changes", async () => {
				const backend = create();
				const pending = job();
				pending.runAt = pending.scheduledAt = (await clock()) + 100;
				const record = await put(backend, pending);
				expect(await backend.claim("early", 1000)).toBeUndefined();
				await Bun.sleep(140);
				const claimed = await backend.claim("due", 1000);
				expect(claimed?.id).toBe(record.id);
				expect(claimed?.data).toEqual(record.data);
			});
			test("expired leases recover, with stale completion and renewal rejected", async () => {
				const name = queue();
				const first = create(name);
				const second = storage === "redis" ? create(name) : first;
				const record = await put(first);
				expect((await first.claim("old-owner", 40))?.id).toBe(record.id);
				await Bun.sleep(70);
				const recovered = await second.claim("new-owner", 1000);
				expect(recovered?.id).toBe(record.id);
				expect(recovered?.attemptsMade).toBe(2);
				expect(await first.renew(record.id, "old-owner", 1000)).toBe(false);
				expect(
					await first.settle(record.id, "old-owner", {
						...record,
						state: "completed",
					}),
				).toBe(false);
				expect(
					await second.settle(record.id, "new-owner", {
						...record,
						state: "completed",
					}),
				).toBe(true);
				expect((await first.get(record.id))?.state).toBe("completed");
			});
			test("renewal protects a long job and deleting an active job cannot resurrect it", async () => {
				const backend = create();
				const record = await put(backend);
				expect((await backend.claim("owner", 50))?.id).toBe(record.id);
				await Bun.sleep(20);
				expect(await backend.renew(record.id, "owner", 500)).toBe(true);
				await Bun.sleep(60);
				expect(await backend.claim("other", 500)).toBeUndefined();
				expect(await backend.delete(record.id)).toBe(true);
				expect(
					await backend.settle(record.id, "owner", {
						...record,
						state: "waiting",
					}),
				).toBe(false);
				expect(await backend.get(record.id)).toBeUndefined();
			});
			test("terminal cleanup does not remove waiting or active jobs", async () => {
				const backend = create();
				const completed = await put(backend);
				const failed = await put(backend);
				const active = await put(backend);
				await put(backend, job(undefined, 10000));
				for (let i = 0; i < 3; i++) {
					const claimed = (await backend.claim(`owner-${i}`, 1000))!;
					expect(claimed).toBeDefined();
					if (claimed.id === active.id) continue;
					await backend.settle(claimed.id, claimed.token!, {
						...claimed,
						state: claimed.id === completed.id ? "completed" : "failed",
					});
				}
				const before =
					Math.max(...(await backend.list()).map((job) => job.updatedAt)) + 1;
				expect(await backend.cleanup(["failed"], before)).toBe(1);
				expect(await backend.get(failed.id)).toBeUndefined();
				expect(await backend.get(completed.id)).toBeDefined();
				expect(await backend.cleanup(["completed", "failed"], before)).toBe(1);
				expect(
					(await backend.list()).map((entry) => entry.state).sort(),
				).toEqual(["active", "waiting"]);
			});
			if (storage === "redis")
				test("records persist across private connection lifecycles", async () => {
					const name = queue();
					const first = create(name);
					const record = await put(first);
					await first.close();
					const second = create(name);
					records.push({ backend: second, id: record.id });
					expect((await second.get(record.id))?.data).toEqual(record.data);
				});
		},
	);
