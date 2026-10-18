import { describe, expect, jest, test } from "bun:test";
import { debounce } from "../../../src/utilities/function/debounce/debounce";

describe("debounce timer lifecycle", () => {
	test("flush consumes the pending call without a later duplicate timer invocation", () => {
		jest.useFakeTimers();
		const calls: number[] = [];
		const debounced = debounce((value: number) => calls.push(value), {
			wait: 50,
		});
		debounced(1);
		expect(debounced.flush()).toBe(1);
		expect(() => jest.advanceTimersByTime(50)).not.toThrow();
		expect(calls).toEqual([1]);
		expect(debounced.flush()).toBe(1);
	});

	test("maxWait consumes the latest arguments once and cancels superseded timers", () => {
		jest.useFakeTimers();
		jest.setSystemTime(10000);
		const calls: number[] = [];
		const debounced = debounce((value: number) => calls.push(value), {
			wait: 50,
			maxWait: 50,
		});
		debounced(1);
		jest.setSystemTime(10050);
		expect(debounced(2)).toBe(1);
		expect(() => jest.advanceTimersByTime(100)).not.toThrow();
		expect(calls).toEqual([2]);
	});

	test("calls after flush still debounce the latest arguments and can be cancelled", () => {
		jest.useFakeTimers();
		const calls: number[] = [];
		const debounced = debounce((value: number) => calls.push(value), {
			wait: 50,
		});
		debounced(1);
		debounced.flush();
		debounced(2);
		debounced(3);
		jest.advanceTimersByTime(50);
		expect(calls).toEqual([1, 3]);
		debounced(4);
		debounced.cancel();
		jest.advanceTimersByTime(50);
		expect(calls).toEqual([1, 3]);
	});
});
