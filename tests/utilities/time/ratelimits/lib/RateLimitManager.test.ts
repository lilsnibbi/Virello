import { afterEach, describe, expect, jest, test } from "bun:test";
import { setTimeout as sleep } from "node:timers/promises";
import { RateLimitManager } from "../../../../../src/utilities/time/ratelimits/index";
import { TimerManager } from "../../../../../src/utilities/time/timers/index";

describe("RateLimitManager", () => {
	afterEach(() => TimerManager.destroy());
	test.each(["clear", "delete"] as const)(
		"stops the sweeper when %s removes the final bucket",
		(operation) => {
			jest.useFakeTimers();
			const manager = new RateLimitManager(60000);
			manager.acquire("one");
			if (operation === "clear") manager.clear();
			else manager.delete("one");
			expect(jest.getTimerCount()).toBe(0);
			manager.acquire("two");
			jest.advanceTimersByTime(60000);
			expect(manager.size).toBe(0);
			expect(jest.getTimerCount()).toBe(0);
		},
	);

	test("cooldown maintenance does not keep a Bun process alive", async () => {
		const moduleUrl = new URL(
			"../../../../../src/utilities/time/ratelimits/RateLimitManager.ts",
			import.meta.url,
		).href;
		const child = Bun.spawn(
			[
				process.execPath,
				"-e",
				`import { RateLimitManager } from ${JSON.stringify(moduleUrl)}; new RateLimitManager(60000).acquire('one');`,
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const timeout = setTimeout(() => child.kill(), 2000);
		try {
			expect(await child.exited).toBe(0);
		} finally {
			clearTimeout(timeout);
			child.kill();
			await child.exited;
		}
	});

	test("Acquiring", () => {
		const manager = new RateLimitManager(1000, 1);

		const ratelimit1 = manager.acquire("one");
		const ratelimit2 = manager.acquire("two");
		expect<unknown>(ratelimit1).toBe(manager.get("one"));
		expect<unknown>(ratelimit2).toBe(manager.get("two"));
	});

	test("Basic Consume", () => {
		const manager = new RateLimitManager(30000, 2);

		const ratelimit = manager.acquire("one");
		ratelimit.consume().consume();
		expect(() => ratelimit.consume()).toThrow(
			"Cannot consume a limited bucket",
		);
	});

	test("Proper resetting", async () => {
		const manager = new RateLimitManager(1000, 2);

		const ratelimit = manager.acquire("one");
		ratelimit.consume().consume();

		expect(ratelimit.limited).toBe(true);

		// Sleep for 1.2 seconds because of how timers work.
		await sleep(1200);

		expect(ratelimit.limited).toBe(false);
		expect(() => ratelimit.consume()).not.toThrow();
	});

	test("Proper sweeping (everything)", async () => {
		const manager = new RateLimitManager(1000, 2);

		manager.acquire("one").consume();

		// Sleep for 1.2 seconds because of how timers work.
		await sleep(1200);
		manager.sweep();

		expect(manager.has("one")).toBe(false);
		expect(manager["sweepInterval"]).toBeNull();
	});

	test("Proper sweeping (not everything)", async () => {
		const manager = new RateLimitManager(1000, 2);

		manager.acquire("one").consume();

		// Sleep for 1.2 seconds because of how timers work.
		await sleep(1200);
		manager.acquire("two").consume();
		manager.sweep();

		expect(manager.has("one")).toBe(false);
		expect(manager.has("two")).toBe(true);
		expect(manager["sweepInterval"]).not.toBeNull();
	});
});
