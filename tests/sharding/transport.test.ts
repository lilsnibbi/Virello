import { describe, expect, test } from "bun:test";
import { Pending } from "../../src/sharding/transport/pending";
import {
	decode,
	encode,
	failure,
	frame,
	limits,
	sendSocket,
	tokenMatches,
} from "../../src/sharding/transport/protocol";
import { ShardError } from "../../src/sharding/types";

describe("sharding transport boundaries", () => {
	test("validates versions, operations, exact fields, types and encoded bytes", () => {
		const valid = encode(
			frame("call", "one", {
				source: 0,
				target: 1,
				name: "probe",
				payload: { empty: [], value: null },
				timeoutMs: 100,
			}),
			1024,
		);
		expect(decode(valid, 1024, ["call"]).data.payload).toEqual({
			empty: [],
			value: null,
		});
		for (const value of [
			valid.replace('"v":1', '"v":2'),
			valid.replace('"target":1', '"target":-1'),
			valid.replace('"source":0', '"extra":0,"source":0'),
			"{",
			"{}",
		])
			expect(() => decode(value, 1024, ["call"])).toThrow();
		expect(() => decode(valid, 1024, ["reply"])).toThrow();
		expect(() => decode(valid, 30, ["call"])).toThrow();
		expect(() => decode(new Uint8Array(), 1024, ["call"])).toThrow();
	});
	test("rejects lossy and dangerous JSON without executing getters", () => {
		let read = false;
		const getter = {
			get value() {
				read = true;
				return 1;
			},
		};
		const cycle: { self?: unknown } = {};
		cycle.self = cycle;
		for (const value of [
			undefined,
			NaN,
			Infinity,
			3n,
			() => {},
			new Date(),
			new Map(),
			cycle,
			getter,
			[undefined],
			new Array(2),
			{ missing: undefined },
		])
			expect(() => encode(value, 1024)).toThrow();
		expect(read).toBe(false);
		let deep: unknown = {};
		for (let i = 0; i < 40; i++) deep = { deep };
		expect(() => encode(deep, 1024)).toThrow();
		expect(() => encode("🙂".repeat(400), 1024)).toThrow();
	});
	test("compares bearer tokens and never resends a backpressured accepted frame", () => {
		expect(tokenMatches("Bearer secret", "secret")).toBe(true);
		expect(tokenMatches("Bearer secrew", "secret")).toBe(false);
		expect(tokenMatches(null, "secret")).toBe(false);
		let count = 0;
		const socket = {
			readyState: 1 as const,
			getBufferedAmount: () => 0,
			send: () => {
				count++;
				return -1;
			},
		};
		sendSocket(socket, frame("ping"), limits());
		expect(count).toBe(1);
		expect(() =>
			sendSocket(
				{ ...socket, getBufferedAmount: () => 262144 },
				frame("ping"),
				limits(),
			),
		).toThrow("buffer");
		expect(() =>
			sendSocket({ ...socket, send: () => 0 }, frame("ping"), limits()),
		).toThrow("dropped");
	});
	test("bounds, cancels, times out and drains pending requests", async () => {
		const pending = new Pending(1);
		const first = pending.create("a", 1000);
		await expect(pending.create("b", 100)).rejects.toThrow("capacity");
		pending.resolve("a", 7);
		expect(await first).toBe(7);
		expect(pending.size).toBe(0);
		let cancelled = 0;
		await expect(
			pending.create("c", 20, undefined, () => cancelled++),
		).rejects.toThrow("timed out");
		expect(cancelled).toBe(1);
		const controller = new AbortController();
		const aborted = pending.create("d", 1000, controller.signal);
		controller.abort(new Error("cancelled"));
		await expect(aborted).rejects.toThrow("cancelled");
		const closing = pending.create("e", 1000);
		pending.close();
		await expect(closing).rejects.toThrow("closed");
		expect(pending.size).toBe(0);
	});
	test("fits escaped and multibyte handler failures into the minimum transport limit", () => {
		for (const [input, expected] of [
			["ordinary failure", "ordinary failure"],
			["\0".repeat(500), "\0".repeat(83)],
			["🙂".repeat(500), "🙂".repeat(125)],
		]) {
			const result = failure(new ShardError("x".repeat(128), input));
			expect(result.error.message).toBe(expected);
			const encoded = encode(
				frame("result", "x".repeat(128), {
					shard: 4095,
					generation: "x".repeat(128),
					result,
				}),
				1024,
			);
			expect(decode(encoded, 1024, ["result"]).data.result).toEqual(result);
		}
	});
});
