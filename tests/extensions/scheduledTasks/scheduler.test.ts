import { afterEach, describe, expect, test } from "bun:test";
import { RedisClient } from "bun";
import {
	type TaskRecord,
	type TaskResolvable,
	type TaskRunContext,
	TaskScheduler,
} from "virello";
import { nextOccurrence } from "../../../src/extensions/scheduledTasks/timing";

declare module "virello" {
	interface Tasks {
		timerTest: never;
		payloadTest: { value: string };
	}
}
const schedulers: TaskScheduler[] = [];
afterEach(async () => {
	await Promise.all(schedulers.splice(0).map((scheduler) => scheduler.close()));
});
class RecordingScheduler extends TaskScheduler {
	calls: { time: number; task: TaskResolvable }[] = [];
	onRun?: (context?: TaskRunContext) => Promise<void>;
	override async run(
		task: TaskResolvable,
		context?: TaskRunContext,
	): Promise<number> {
		this.calls.push({ time: Date.now(), task });
		await this.onRun?.(context);
		return 1;
	}
}
function create(options: ConstructorParameters<typeof TaskScheduler>[0] = {}) {
	const scheduler = new RecordingScheduler({
		pollInterval: 5,
		leaseDuration: 120,
		...options,
	});
	schedulers.push(scheduler);
	return scheduler;
}
async function until(predicate: () => boolean | Promise<boolean>) {
	const limit = Date.now() + 2500;
	while (!(await predicate())) {
		if (Date.now() > limit) throw new Error("Timed out waiting for scheduler");
		await Bun.sleep(5);
	}
}

describe("task scheduler lifecycle", () => {
	test("ambient Redis URLs do not change default storage", async () => {
		const previous = process.env.REDIS_URL;
		process.env.REDIS_URL = "redis://127.0.0.1:1";
		try {
			const scheduler = create();
			expect(scheduler.storage).toBe("memory");
			await scheduler.create("timerTest");
			expect(scheduler.calls).toHaveLength(0);
			await scheduler.start();
			await until(() => scheduler.calls.length === 1);
		} finally {
			if (previous === undefined) delete process.env.REDIS_URL;
			else process.env.REDIS_URL = previous;
		}
	});
	test("delay, bounded retries and failure state reflect thrown work", async () => {
		const scheduler = create();
		let attempts = 0;
		scheduler.onRun = async () => {
			attempts++;
			throw new Error("expected task failure");
		};
		const start = Date.now();
		const job = await scheduler.create("timerTest", {
			delay: 80,
			attempts: 3,
			retryDelay: 35,
		});
		await scheduler.start();
		await Bun.sleep(30);
		expect(attempts).toBe(0);
		await until(async () => (await scheduler.get(job.id))?.state === "failed");
		const failed = await scheduler.get(job.id);
		expect(attempts).toBe(3);
		expect(failed?.lastError).toBe("expected task failure");
		expect(failed?.attemptsMade).toBe(3);
		expect(scheduler.calls[0].time - start).toBeGreaterThanOrEqual(75);
		expect(
			scheduler.calls[1].time - scheduler.calls[0].time,
		).toBeGreaterThanOrEqual(30);
	});
	test("success after retry retains useful state and cleanup removes only completed records", async () => {
		const scheduler = create();
		let attempts = 0;
		scheduler.onRun = async () => {
			if (++attempts === 1) throw new Error("once");
		};
		const job = await scheduler.create("timerTest", {
			attempts: 2,
			retryDelay: 10,
			removeOnComplete: false,
		});
		await scheduler.start();
		await until(
			async () => (await scheduler.get(job.id))?.state === "completed",
		);
		expect(attempts).toBe(2);
		await scheduler.create("timerTest", 100000);
		expect(await scheduler.cleanup({ before: Date.now() + 1 })).toBe(1);
		expect(await scheduler.list()).toHaveLength(1);
	});
	test("repeated creation is idempotent, skips missed ticks and deletes future occurrences", async () => {
		const scheduler = create();
		scheduler.onRun = async () => {
			await Bun.sleep(45);
		};
		const job = await scheduler.create("timerTest", {
			repeated: true,
			interval: 20,
		});
		expect(
			(await scheduler.create("timerTest", { repeated: true, interval: 20 }))
				.id,
		).toBe(job.id);
		expect(await scheduler.listRepeated()).toHaveLength(1);
		await scheduler.start();
		await until(() => scheduler.calls.length >= 2);
		expect(
			scheduler.calls[1].time - scheduler.calls[0].time,
		).toBeGreaterThanOrEqual(45);
		await scheduler.delete(job.id);
		const count = scheduler.calls.length;
		await Bun.sleep(90);
		expect(scheduler.calls).toHaveLength(count);
		expect(await scheduler.get(job.id)).toBeUndefined();
	});
	test("concurrency is bounded; close drains active work and preserves no memory queue", async () => {
		const scheduler = create({ concurrency: 2 });
		let active = 0,
			maximum = 0;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		scheduler.onRun = async () => {
			active++;
			maximum = Math.max(maximum, active);
			await gate;
			active--;
		};
		for (let i = 0; i < 5; i++) await scheduler.create("timerTest");
		await scheduler.start();
		await until(() => active === 2);
		let closed = false;
		const closing = scheduler.close().then(() => {
			closed = true;
		});
		expect(scheduler.close()).toBe(scheduler.close());
		await Bun.sleep(30);
		expect(closed).toBe(false);
		release();
		await closing;
		expect(maximum).toBe(2);
		expect(scheduler.calls).toHaveLength(2);
		await expect(scheduler.start()).rejects.toThrow("closed");
		await expect(scheduler.create("timerTest")).rejects.toThrow("closed");
	});
	test("missing Redis rejects explicitly rather than switching storage", async () => {
		const listener = Bun.listen({
			hostname: "127.0.0.1",
			port: 0,
			socket: { data() {} },
		});
		const port = listener.port;
		listener.stop(true);
		const scheduler = create({
			redis_url: `redis://127.0.0.1:${port}`,
			connectionTimeout: 100,
		});
		await expect(scheduler.start()).rejects.toThrow("No memory fallback");
		expect(scheduler.storage).toBe("redis");
	}, 10000);
	test("invalid scheduling inputs fail before storing work", async () => {
		const scheduler = create();
		for (const options of [
			{ delay: -1 },
			{ attempts: 0 },
			{ repeated: true, interval: 0 },
			{ repeated: true, interval: 10, pattern: "* * * * *" },
			{ repeated: true, interval: 10, delay: 2 },
			{ repeated: "yes", interval: 10 },
			{ removeOnComplete: "yes" },
			{ repeated: true, pattern: "not a cron" },
			{ customJobOptions: {} },
			{ repeated: true, pattern: "0 9 * * *", timezone: "Not/AZone" },
		])
			await expect(
				scheduler.create("timerTest", options as never),
			).rejects.toThrow();
		await expect(
			scheduler.create({
				name: "payloadTest",
				payload: { value: 1n },
			} as never),
		).rejects.toThrow("JSON");
		await expect(
			scheduler.create({ name: "payloadTest", payload: new Array(2) } as never),
		).rejects.toThrow("JSON");
		expect(await scheduler.list()).toEqual([]);
	});
});

test("cron scheduling keeps timezones and DST while intervals skip missed occurrences", () => {
	expect(
		new Date(
			nextOccurrence(
				{ pattern: "0 9 * * *", timezone: "America/New_York" },
				0,
				Date.parse("2026-03-07T15:00:00Z"),
			),
		).toISOString(),
	).toBe("2026-03-08T13:00:00.000Z");
	expect(nextOccurrence({ interval: 1000 }, 5000, 10400)).toBe(11000);
});

const url = process.env.VIRELLO_TEST_REDIS_URL;
describe.skipIf(!url)("live Redis scheduler", () => {
	async function withTestUser(
		run: (
			admin: RedisClient,
			username: string,
			address: string,
		) => Promise<void>,
	) {
		if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url!).hostname))
			throw new Error("Expected loopback test Redis");
		const admin = new RedisClient(url!);
		const username = `virello-test-${crypto.randomUUID()}`;
		const password = crypto.randomUUID();
		const address = new URL(url!);
		address.username = username;
		address.password = password;
		try {
			await admin.connect();
			await admin.send("ACL", [
				"SETUSER",
				username,
				"on",
				`>${password}`,
				"~virello:tasks:v1:*",
				"+ping",
				"+eval",
				"+hget",
				"+hset",
				"+hdel",
				"+hvals",
				"+zadd",
				"+zrangebyscore",
				"+zrem",
				"+time",
			]);
			await run(admin, username, address.href);
		} finally {
			await admin.send("ACL", ["DELUSER", username]);
			admin.close();
		}
	}
	test("authentication and command permissions fail startup instead of reporting success", async () => {
		await withTestUser(async (admin, username, address) => {
			const wrongPassword = new URL(address);
			wrongPassword.password = "incorrect";
			const invalid = create({
				redis_url: wrongPassword.href,
				connectionTimeout: 200,
			});
			await expect(invalid.start()).rejects.toThrow("No memory fallback");
			await admin.send("ACL", ["SETUSER", username, "-eval"]);
			const denied = create({ redis_url: address, connectionTimeout: 200 });
			await expect(denied.start()).rejects.toThrow("NOPERM");
			await expect(denied.create("timerTest")).rejects.toThrow("closed");
		});
	});
	test("a reconnectable socket loss keeps the Redis queue and resumes polling", async () => {
		await withTestUser(async (admin, username, address) => {
			const scheduler = create({
				redis_url: address,
				queue: `reconnect-${crypto.randomUUID()}`,
				connectionTimeout: 200,
				leaseDuration: 5000,
			});
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			scheduler.onRun = () => gate;
			const jobs = [
				await scheduler.create("timerTest"),
				await scheduler.create("timerTest"),
			];
			const connections = async () =>
				String(await admin.send("CLIENT", ["LIST"]))
					.split("\n")
					.filter((line) => line.split(" ").includes(`user=${username}`))
					.map((line) => line.split(" ")[0]);
			try {
				await scheduler.start();
				await until(() => scheduler.calls.length === 1);
				const previous = await connections();
				expect(previous).toHaveLength(1);
				expect(await admin.send("CLIENT", ["KILL", "USER", username])).toBe(1);
				// Gate work across the real disconnect; elapsed time and client/server clocks do not establish recovery.
				await until(async () =>
					(await connections()).some((id) => !previous.includes(id)),
				);
				release();
				await until(() => scheduler.calls.length === 2);
				expect(scheduler.storage).toBe("redis");
				await until(async () => (await scheduler.list()).length === 0);
			} finally {
				release();
				try {
					for (const job of jobs) await scheduler.delete(job.id);
				} finally {
					await scheduler.close();
				}
			}
		});
	});
	test("two workers share one queue, renew slow tasks, and preserve JSON payloads", async () => {
		if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url!).hostname))
			throw new Error("Expected loopback test Redis");
		const queue = `live-${crypto.randomUUID()}`;
		const options = {
			redis_url: url!,
			queue,
			concurrency: 2,
			pollInterval: 10,
			leaseDuration: 90,
		};
		const first = create(options),
			second = create(options);
		const ids: string[] = [];
		const calls: TaskRecord[] = [];
		first.onRun = second.onRun = async (context) => {
			calls.push(context!.job);
			await Bun.sleep(220);
			expect(context!.signal.aborted).toBe(false);
		};
		try {
			for (let i = 0; i < 8; i++)
				ids.push((await first.create("timerTest")).id);
			await Promise.all([first.start(), second.start()]);
			await until(() => calls.length === 8);
			await Bun.sleep(300);
			expect(calls).toHaveLength(8);
			expect(new Set(calls.map((call) => call.id)).size).toBe(8);
			expect(await first.list()).toEqual([]);
		} finally {
			for (const id of ids) await first.delete(id);
		}
	}, 10000);
});
