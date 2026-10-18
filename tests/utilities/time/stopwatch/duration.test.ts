import { describe, expect, test } from "bun:test";
import { Stopwatch } from "../../../../src/utilities/time/stopwatch/index";
import { sleep } from "./shared";

describe("Duration", () => {
	test("duration(running)", async () => {
		const stopwatch = new Stopwatch();

		const first = stopwatch.duration;

		await sleep(1000);
		stopwatch.stop();
		const second = stopwatch.duration;

		expect(first < second).toBe(true);
	});
});
