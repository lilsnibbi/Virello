import { describe, expect, setSystemTime, test } from "bun:test";
import {
	IdentifyScheduler,
	identifyCooldownMs,
} from "../../src/sharding/coordinator/identify";

const limit = {
	total: 10,
	remaining: 10,
	reset_after: 100000,
	max_concurrency: 2,
};
function scheduler() {
	let now = 0;
	const value = new IdentifyScheduler(() => now);
	value.update(limit);
	return { value, advance: (ms: number) => (now += ms) };
}

describe("in-memory Discord identify scheduling", () => {
	test("every new coordinator observes a startup cooldown without spending allowance", () => {
		const s = scheduler();
		expect(s.value.grant("a", 0, "one")).toBe(false);
		s.advance(identifyCooldownMs - 1);
		expect(s.value.grant("a", 0, "one")).toBe(false);
		expect(s.value.remaining).toBe(10);
		s.advance(1);
		expect(s.value.grant("a", 0, "one")).toBe(true);
		expect(s.value.remaining).toBe(9);
	});
	test("holds a bucket until readiness or disconnect, then cools down; other buckets progress", () => {
		const s = scheduler();
		s.advance(identifyCooldownMs);
		expect(s.value.grant("connection-a", 0, "one")).toBe(true);
		expect(s.value.grant("connection-b", 1, "two")).toBe(true);
		s.advance(20000);
		expect(s.value.grant("replacement", 2, "three")).toBe(false);
		s.value.stopped("connection-a", 0, "stale");
		expect(s.value.grant("replacement", 2, "three")).toBe(false);
		s.value.stopped("connection-a");
		s.advance(identifyCooldownMs - 1);
		expect(s.value.grant("replacement", 2, "three")).toBe(false);
		s.advance(1);
		expect(s.value.grant("replacement", 2, "three")).toBe(true);
		// Delayed cleanup from an old connection cannot release the new connection's permit.
		s.value.stopped("connection-a");
		s.advance(20000);
		expect(s.value.grant("another", 4, "four")).toBe(false);
		s.value.stopped("replacement", 2, "three");
		s.advance(identifyCooldownMs);
		expect(s.value.grant("another", 4, "four")).toBe(true);
		expect(s.value.remaining).toBe(6);
	});
	test("does not refund cancelled or disconnected permits or increase an unexpired allowance", () => {
		const s = scheduler();
		s.advance(identifyCooldownMs);
		s.value.update({ ...limit, remaining: 1 });
		expect(s.value.grant("a", 0, "one")).toBe(true);
		s.value.stopped("a");
		s.value.update(limit);
		s.advance(identifyCooldownMs);
		expect(s.value.remaining).toBe(0);
		expect(s.value.grant("b", 1, "two")).toBe(false);
	});
	test("expiry alone never replenishes a snapshot and a new process uses only its fresh snapshot", () => {
		const s = scheduler();
		s.advance(100000);
		expect(s.value.expired).toBe(true);
		expect(s.value.grant("a", 0, "one")).toBe(false);
		s.value.update({ ...limit, remaining: 2 });
		expect(s.value.grant("a", 0, "one")).toBe(true);
		expect(s.value.remaining).toBe(1);
		const replacement = scheduler();
		replacement.value.update({ ...limit, remaining: 0 });
		replacement.advance(identifyCooldownMs);
		expect(replacement.value.grant("a", 0, "two")).toBe(false);
	});
	test("zero reset intervals use the reported allowance without immediate expiry or invented refill", () => {
		const s = scheduler();
		s.advance(100000);
		s.value.update({ ...limit, reset_after: 0 });
		expect(s.value.grant("a", 0, "one")).toBe(true);
		s.value.update({ ...limit, reset_after: 0 });
		expect(s.value.remaining).toBe(9);
		s.advance(59999);
		expect(s.value.expired).toBe(false);
		s.advance(1);
		expect(s.value.remaining).toBe(0);
	});
	test("wall-clock jumps cannot expire or replenish the monotonic allowance", () => {
		const s = scheduler();
		try {
			s.advance(identifyCooldownMs);
			expect(s.value.grant("a", 0, "one")).toBe(true);
			setSystemTime(new Date("2099-01-01T00:00:00Z"));
			s.value.update(limit);
			expect(s.value.remaining).toBe(9);
			setSystemTime(new Date("2000-01-01T00:00:00Z"));
			s.advance(100000);
			expect(s.value.expired).toBe(true);
		} finally {
			setSystemTime();
		}
	});
	test("rejects impossible metadata and concurrency changes while an old bucket is active", () => {
		const s = scheduler();
		for (const value of [
			{ ...limit, remaining: 11 },
			{ ...limit, reset_after: -1 },
			{ ...limit, max_concurrency: 0 },
		])
			expect(() => s.value.update(value)).toThrow();
		expect(() => s.value.update({ ...limit, max_concurrency: 1 })).toThrow(
			"max_concurrency",
		);
		s.advance(identifyCooldownMs);
		s.value.grant("a", 0, "one");
		s.advance(100000);
		expect(() => s.value.update({ ...limit, max_concurrency: 1 })).toThrow(
			"max_concurrency",
		);
		s.value.stopped("a");
		s.advance(identifyCooldownMs);
		expect(() =>
			s.value.update({ ...limit, max_concurrency: 1 }),
		).not.toThrow();
	});
});
